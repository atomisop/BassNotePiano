import { prisma } from "@/lib/prisma";
import { createAndSendCode, RateLimitError, verifyCode } from "@/lib/verification";
import { assessPhone } from "@/lib/phoneValidity";
import { checkVerifySession, isSmsConfigured, smsAvailable, startVerifySession } from "@/lib/sms";
import { getBoolSetting, getNumberSetting } from "@/lib/siteSettings";

export type PhoneResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const REASON_MESSAGES: Record<string, string> = {
  not_found: "We couldn't find an active code. Request a new one.",
  expired: "That code has expired. Request a new one.",
  too_many_attempts: "Too many incorrect tries. Request a new code.",
  incorrect: "That code isn't right. Check it and try again.",
};
const TAKEN = "That number is already linked to another account.";

/**
 * Whether numbers are confirmed by text right now: the owner switched it on and a text service is set up. Off by
 * default, so numbers are just kept as typed. Everything that gates people on a confirmed number checks this.
 */
export async function phoneVerifyMode(): Promise<boolean> {
  return smsAvailable() && (await getBoolSetting("phone.verifyBySms"));
}

/** A number someone has CONFIRMED by text belongs to that one account. Typed-only numbers can be shared (a family). */
async function isTaken(phone: string, userId: string): Promise<boolean> {
  return Boolean(await prisma.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null }, id: { not: userId } }, select: { id: true } }));
}

const SEND_FAILED = "We couldn't send the text just now. Check the number and try again in a minute.";
const TOO_MANY = "Too many codes requested. Please wait a few minutes and try again.";

/**
 * With a provider (Plivo Verify) the provider makes, texts and checks the code, so we only keep a row that
 * remembers its session, when it expires and how many tries were used. Same throttle as every other code.
 */
async function sendProviderCode(user: { id: string; email: string }, phone: string): Promise<PhoneResult> {
  const email = user.email.toLowerCase();
  const windowStart = new Date(Date.now() - (await getNumberSetting("security.codeIssueWindowMinutes")) * 60_000);
  const recent = await prisma.verificationCode.count({ where: { email, purpose: "PHONE_VERIFY", createdAt: { gte: windowStart } } });
  if (recent >= (await getNumberSetting("security.codeIssueLimit"))) return { ok: false, error: TOO_MANY };

  let session: string;
  try {
    session = await startVerifySession(phone);
  } catch (err) {
    console.error("Phone verification text failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: SEND_FAILED };
  }
  // Only the newest code counts: close any still open, then record this one.
  await prisma.verificationCode.updateMany({ where: { email, purpose: "PHONE_VERIFY", consumedAt: null }, data: { consumedAt: new Date() } });
  await prisma.verificationCode.create({
    data: {
      email,
      userId: user.id,
      purpose: "PHONE_VERIFY",
      codeHash: "provider", // there is no code here to hash: the provider holds it
      payload: { phone, session },
      expiresAt: new Date(Date.now() + (await getNumberSetting("security.codeExpiryMinutes")) * 60_000),
    },
  });
  return { ok: true };
}

/** The provider-checked counterpart of verifyCode: same reasons, same attempt limit. */
async function checkProviderCode(email: string, code: string): Promise<{ ok: true; phone: string } | { ok: false; error: string }> {
  const record = await prisma.verificationCode.findFirst({
    where: { email: email.toLowerCase(), purpose: "PHONE_VERIFY", consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return { ok: false, error: REASON_MESSAGES.not_found };
  if (record.expiresAt < new Date()) return { ok: false, error: REASON_MESSAGES.expired };
  const { phone, session } = (record.payload ?? {}) as { phone?: string; session?: string };
  if (!phone || !session) return { ok: false, error: REASON_MESSAGES.not_found };

  // A try is claimed before asking, so a burst of parallel guesses cannot all slip under the limit.
  const claimed = await prisma.verificationCode.updateMany({
    where: { id: record.id, consumedAt: null, attempts: { lt: await getNumberSetting("security.maxCodeAttempts") } },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return { ok: false, error: REASON_MESSAGES.too_many_attempts };

  const outcome = await checkVerifySession(session, code);
  if (outcome === "error") {
    // Not their mistake: give the try back.
    await prisma.verificationCode.updateMany({ where: { id: record.id, attempts: { gt: 0 } }, data: { attempts: { decrement: 1 } } });
    return { ok: false, error: "We couldn't check that code just now. Please try again in a moment." };
  }
  if (outcome === "invalid") return { ok: false, error: REASON_MESSAGES.incorrect };
  const used = await prisma.verificationCode.updateMany({ where: { id: record.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (used.count === 0) return { ok: false, error: REASON_MESSAGES.not_found };
  return { ok: true, phone };
}

async function sendCode(user: { id: string; email: string }, phone: string): Promise<PhoneResult> {
  if (isSmsConfigured()) return sendProviderCode(user, phone);
  try {
    const sent = await createAndSendCode({ email: user.email, userId: user.id, purpose: "PHONE_VERIFY", payload: { phone } });
    if (!sent.ok) return { ok: false, error: SEND_FAILED };
    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: TOO_MANY };
    throw err;
  }
}

/** Takes a typed number and texts it a code. The number only becomes the account's once the code is confirmed. */
export async function startPhoneVerification(userId: string, rawPhone: string): Promise<PhoneResult<{ phone: string }>> {
  const assessed = assessPhone(rawPhone);
  if (!assessed.ok) return assessed;
  const phone = assessed.phone;
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
  let phone: string | undefined;
  if (isSmsConfigured()) {
    const checked = await checkProviderCode(user.email, code);
    if (!checked.ok) return checked;
    phone = checked.phone;
  } else {
    const result = await verifyCode(user.email, "PHONE_VERIFY", code);
    if (!result.ok) return { ok: false, error: REASON_MESSAGES[result.reason] };
    phone = (result.payload as { phone?: string } | null)?.phone;
  }
  // The code only counts for the number it was sent to, which must still be the one waiting.
  if (!phone || phone !== user.pendingPhone) return { ok: false, error: "That code was for a different number. Request a new one." };
  if (await isTaken(phone, userId)) return { ok: false, error: TAKEN };
  await prisma.user.update({ where: { id: userId }, data: { phone, phoneVerifiedAt: new Date(), pendingPhone: null } });
  return { ok: true, phone };
}

/**
 * Saves a typed number as-is, after checking it looks real. No text is sent, so nothing is proven: it is kept
 * as a clue (the payment matcher cross-checks it) and the number stays "not verified". Changing it clears any
 * earlier confirmation, because the confirmed number is gone.
 */
export async function savePhone(userId: string, rawPhone: string): Promise<PhoneResult<{ phone: string }>> {
  const assessed = assessPhone(rawPhone);
  if (!assessed.ok) return assessed;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (!user) return { ok: false, error: "Account not found." };
  if (user.phone !== assessed.phone) {
    await prisma.user.update({ where: { id: userId }, data: { phone: assessed.phone, phoneVerifiedAt: null, pendingPhone: null } });
  }
  return { ok: true, phone: assessed.phone };
}

/** Removes the number. An account that had to give one at sign-up can change it but not remove it. */
export async function removePhone(userId: string): Promise<PhoneResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phoneRequired: true } });
  if (!user) return { ok: false, error: "Account not found." };
  if (user.phoneRequired) return { ok: false, error: "A phone number is required on your account. You can change it to a different number instead." };
  await prisma.user.update({ where: { id: userId }, data: { phone: null, phoneVerifiedAt: null, pendingPhone: null } });
  return { ok: true };
}
