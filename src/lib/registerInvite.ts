import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rateLimit";
import { ensureReferralCode } from "@/lib/referrals";
import { getAppUrl, sendPersonalEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { reportError } from "@/lib/reportError";

/** What happened when a student asked us to email someone an invitation to create an account. */
export type RegisterInviteResult = "sent" | "exists" | "recent" | "invalid" | "failed";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

/** Why they are asked: "classes" (a family plan or booking together, the default) or "parent" (a parent who wants to link to them). */
export type RegisterInvitePurpose = "classes" | "parent";

/** The invitation's words. A parent's says what accepting means; the account is made with the invited address so the request can find it. */
export function registerInviteText(who: string, purpose: RegisterInvitePurpose): { subject: string; body: string; label: string } {
  if (purpose === "parent") {
    return {
      subject: `${who} invited you to Bass Note Piano`,
      body: `${who} would like to be your parent account at Bass Note Piano, to help with your classes. Create an account with this email address and you will be asked to accept. Nothing is shared unless you say yes.`,
      label: "Create your account",
    };
  }
  return {
    subject: `${who} invited you to Bass Note Piano`,
    body: `${who} would like you in their classes at Bass Note Piano. Create an account with this email address and they can add you.`,
    label: "Create your account",
  };
}

const markerKey = (email: string) => `register-invite:${createHash("sha256").update(email).digest("hex").slice(0, 32)}`;

/**
 * Emails someone who has no account yet an invitation to create one, from a student who is setting up a family plan or booking for the
 * family. Never to an address that already has an account, at most one invitation to the same address every 14 days (whoever sends it),
 * and a daily limit per sender, so it cannot be used to mail strangers. The invitation carries the sender's own invite link.
 */
export async function sendRegisterInvite(senderId: string, rawEmail: string, options: { purpose?: RegisterInvitePurpose } = {}): Promise<RegisterInviteResult> {
  // Whether an address already has an account is an answer worth guarding, so even the "exists" and "recent" answers are limited.
  await consumeRateLimit(prisma, `register-invite-lookup:${senderId}`, { windowMinutes: 60, max: 30, message: "Too many tries. Please wait a while and try again." });
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(email) || email.length > 254) return "invalid";
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return "exists";

  const marker = await prisma.appSetting.findUnique({ where: { key: markerKey(email) }, select: { value: true } });
  if (marker && Date.now() - Number(marker.value) < RESEND_AFTER_MS) return "recent";

  await consumeRateLimit(prisma, `register-invite:${senderId}`, { windowMinutes: 24 * 60, max: 10, message: "Too many invitations today. Try again tomorrow." });

  const sender = await prisma.user.findUniqueOrThrow({ where: { id: senderId }, select: { name: true, email: true } });
  const code = await ensureReferralCode(senderId);
  const who = sender.name?.trim() || "Someone";
  const text = registerInviteText(who, options.purpose ?? "classes");
  try {
    await sendPersonalEmail(email, text.subject, text.body, {
      link: { label: text.label, url: getAppUrl(`/register?ref=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}`) },
    });
  } catch (err) {
    // The email service refused the address or is down: nothing was sent, so nothing is recorded and they can try again.
    reportError(err, "registerInvite");
    return "failed";
  }
  await prisma.appSetting.upsert({ where: { key: markerKey(email) }, create: { key: markerKey(email), value: String(Date.now()) }, update: { value: String(Date.now()) } });
  await logAudit({ actorId: senderId, actorEmail: sender.email, action: "invite.register", targetType: "Email", targetId: markerKey(email), detail: `Invited ${email} to create an account` }).catch(() => undefined);
  return "sent";
}
