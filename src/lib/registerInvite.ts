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

const markerKey = (email: string) => `register-invite:${createHash("sha256").update(email).digest("hex").slice(0, 32)}`;
/** The studio may send an applicant the sign-up link again the next day (a student's invitation waits 14). */
const STUDIO_RESEND_AFTER_MS = 24 * 60 * 60 * 1000;

/** When an invitation (a student's or the studio's) last went to each address (lowercased), in one query. Shown on the applicant cards. */
export async function registerInvitesSentAt(rawEmails: string[]): Promise<Map<string, Date>> {
  const byKey = new Map(rawEmails.map((e) => [markerKey(e.trim().toLowerCase()), e.trim().toLowerCase()]));
  const rows = byKey.size ? await prisma.appSetting.findMany({ where: { key: { in: [...byKey.keys()] } }, select: { key: true, value: true } }) : [];
  return new Map(rows.filter((r) => Number.isFinite(Number(r.value))).map((r) => [byKey.get(r.key)!, new Date(Number(r.value))]));
}

/**
 * Emails someone who has no account yet an invitation to create one, from a student who is setting up a family plan or booking for the
 * family. Never to an address that already has an account, at most one invitation to the same address every 14 days (whoever sends it),
 * and a daily limit per sender, so it cannot be used to mail strangers. The invitation carries the sender's own invite link.
 * `fromStudio`: the studio sending an approved applicant the sign-up link (Applicants). It comes from Bass Note Piano, opens sign-up with
 * their address filled in, carries no referral code, and may go again after a day.
 */
export async function sendRegisterInvite(senderId: string, rawEmail: string, opts: { fromStudio?: boolean } = {}): Promise<RegisterInviteResult> {
  // Whether an address already has an account is an answer worth guarding, so even the "exists" and "recent" answers are limited.
  await consumeRateLimit(prisma, `register-invite-lookup:${senderId}`, { windowMinutes: 60, max: 30, message: "Too many tries. Please wait a while and try again." });
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(email) || email.length > 254) return "invalid";
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return "exists";

  const marker = await prisma.appSetting.findUnique({ where: { key: markerKey(email) }, select: { value: true } });
  if (marker && Date.now() - Number(marker.value) < (opts.fromStudio ? STUDIO_RESEND_AFTER_MS : RESEND_AFTER_MS)) return "recent";

  await consumeRateLimit(prisma, `register-invite:${senderId}`, { windowMinutes: 24 * 60, max: 10, message: "Too many invitations today. Try again tomorrow." });

  const sender = await prisma.user.findUniqueOrThrow({ where: { id: senderId }, select: { name: true, email: true } });
  try {
    if (opts.fromStudio) {
      await sendPersonalEmail(email, "Create your Bass Note Piano account", "Your classes at Bass Note Piano are ready to set up. Create an account with this email address and we can choose your weekly time.", {
        link: { label: "Create your account", url: getAppUrl(`/register?email=${encodeURIComponent(email)}`) },
      });
    } else {
      const code = await ensureReferralCode(senderId);
      const who = sender.name?.trim() || "Someone";
      await sendPersonalEmail(email, `${who} invited you to Bass Note Piano`, `${who} would like you in their classes at Bass Note Piano. Create an account with this email address and they can add you.`, {
        link: { label: "Create your account", url: getAppUrl(`/register?ref=${encodeURIComponent(code)}`) },
      });
    }
  } catch (err) {
    // The email service refused the address or is down: nothing was sent, so nothing is recorded and they can try again.
    reportError(err, "registerInvite");
    return "failed";
  }
  await prisma.appSetting.upsert({ where: { key: markerKey(email) }, create: { key: markerKey(email), value: String(Date.now()) }, update: { value: String(Date.now()) } });
  await logAudit({ actorId: senderId, actorEmail: sender.email, action: "invite.register", targetType: "Email", targetId: markerKey(email), detail: opts.fromStudio ? `Sent ${email} the studio's sign-up link` : `Invited ${email} to create an account` }).catch(() => undefined);
  return "sent";
}
