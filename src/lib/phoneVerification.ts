import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAndSendCode, RateLimitError, verifyCode } from "@/lib/verification";
import { normalizePhone } from "@/lib/phone";

export type PhoneResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const REASON_MESSAGES: Record<string, string> = {
  not_found: "We couldn't find an active code. Request a new one.",
  expired: "That code has expired. Request a new one.",
  too_many_attempts: "Too many incorrect tries. Request a new code.",
  incorrect: "That code isn't right. Check it and try again.",
};
const TAKEN = "That number is already linked to another account.";

/** The number must be free: a verified number belongs to exactly one account. */
async function isTaken(phone: string, userId: string): Promise<boolean> {
  return Boolean(await prisma.user.findFirst({ where: { phone, id: { not: userId } }, select: { id: true } }));
}

async function sendCode(user: { id: string; email: string }, phone: string): Promise<PhoneResult> {
  try {
    const sent = await createAndSendCode({ email: user.email, userId: user.id, purpose: "PHONE_VERIFY", payload: { phone } });
    if (!sent.ok) return { ok: false, error: "We couldn't send the text just now. Check the number and try again in a minute." };
    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: "Too many codes requested. Please wait a few minutes and try again." };
    throw err;
  }
}

/** Takes a typed number and texts it a code. The number only becomes the account's once the code is confirmed. */
export async function startPhoneVerification(userId: string, rawPhone: string): Promise<PhoneResult<{ phone: string }>> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: "That doesn't look like a phone number. US and Canada numbers work as typed; anywhere else, start with + and your country code." };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, phone: true, phoneVerifiedAt: true } });
  if (!user) return { ok: false, error: "Account not found." };
  if (user.phone === phone && user.phoneVerifiedAt) return { ok: false, error: "That number is already verified on your account." };
  if (await isTaken(phone, userId)) return { ok: false, error: TAKEN };

  await prisma.user.update({ where: { id: userId }, data: { pendingPhone: phone } });
  const sent = await sendCode(user, phone);
  return sent.ok ? { ok: true, phone } : sent;
}

/** Texts a fresh code to the number already waiting for confirmation. */
export async function resendPhoneCode(userId: string): Promise<PhoneResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, pendingPhone: true } });
  if (!user?.pendingPhone) return { ok: false, error: "Enter a phone number first." };
  return sendCode(user, user.pendingPhone);
}

export async function confirmPhoneVerification(userId: string, code: string): Promise<PhoneResult<{ phone: string }>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, pendingPhone: true } });
  if (!user) return { ok: false, error: "Account not found." };
  const result = await verifyCode(user.email, "PHONE_VERIFY", code);
  if (!result.ok) return { ok: false, error: REASON_MESSAGES[result.reason] };
  const phone = (result.payload as { phone?: string } | null)?.phone;
  // The code only counts for the number it was sent to, which must still be the one waiting.
  if (!phone || phone !== user.pendingPhone) return { ok: false, error: "That code was for a different number. Request a new one." };
  try {
    await prisma.user.update({ where: { id: userId }, data: { phone, phoneVerifiedAt: new Date(), pendingPhone: null } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { ok: false, error: TAKEN };
    throw err;
  }
  return { ok: true, phone };
}

/** Removes the number. An account that had to give one at sign-up can change it but not remove it. */
export async function removePhone(userId: string): Promise<PhoneResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phoneRequired: true } });
  if (!user) return { ok: false, error: "Account not found." };
  if (user.phoneRequired) return { ok: false, error: "A phone number is required on your account. You can change it to a different number instead." };
  await prisma.user.update({ where: { id: userId }, data: { phone: null, phoneVerifiedAt: null, pendingPhone: null } });
  return { ok: true };
}
