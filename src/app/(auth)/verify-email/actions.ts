"use server";

import { prisma } from "@/lib/prisma";
import { getNumberSetting } from "@/lib/siteSettings";
import { verifyCode, createAndSendCode, createSilentCode, RateLimitError, type VerifyCodeResult } from "@/lib/verification";
import { sendWelcomeEmail } from "@/lib/email";
import { notifyAdmins } from "@/lib/adminNotifications";
import { withTimingFloor } from "@/lib/timingSafe";
import { phoneVerifyMode, resendPhoneCode } from "@/lib/phoneVerification";

const REASON_MESSAGES: Record<string, string> = {
  not_found: "We couldn't find an active code for this email. Request a new one below.",
  expired: "That code has expired. Request a new one below.",
  too_many_attempts: "Too many incorrect attempts. Request a new code below.",
  incorrect: "That code isn't right. Double-check and try again.",
};

export async function verifyEmailAction(email: string, code: string) {
  const result: VerifyCodeResult = await verifyCode(email, "EMAIL_VERIFY", code);
  if (!result.ok) {
    return { ok: false as const, error: REASON_MESSAGES[result.reason] };
  }
  if (!result.userId) {
    return { ok: false as const, error: "Something went wrong. Request a new code." };
  }

  const user = await prisma.user.update({
    where: { id: result.userId },
    data: { emailVerified: new Date() },
    select: { id: true, email: true, name: true, phoneRequired: true, phoneVerifiedAt: true },
  });

  // Owner only: the account they were told about as "not verified yet" now is.
  await notifyAdmins("ACCOUNT_VERIFIED", {
    type: "ADMIN_ALERT",
    title: "New user verified their account",
    body: `${user.name ?? user.email} (${user.email}) verified their email.`,
    emailCategory: "social",
    cta: { label: "View account", path: `/admin/users/${user.id}` },
  });

  // First real proof the account is fully created, a one-time welcome
  // email, not routed through the notification-preference system since
  // there's no in-app equivalent and no opt-out that would make sense here.
  // Non-blocking: a failed welcome email should never stop verification
  // from succeeding.
  sendWelcomeEmail(user.email, user.name).catch((err) => console.error("Welcome email failed (non-blocking):", err));

  // Verifying the email is itself proof enough to log in immediately,
  // issue a fresh LOGIN_2FA code silently (never emailed) so the client can
  // turn around and sign in with it in the same flow, no second code needed.
  // Rate-limiting this specific call would only trip on repeated verify+
  // auto-login cycles for one address in a short window, an edge case, but
  // still handled rather than left to crash.
  try {
    const { code: autoCode } = await createSilentCode({ email: user.email, userId: user.id, purpose: "LOGIN_2FA" });
    // An account made while a phone number was required still has to confirm it. The text goes out now, so the
    // next screen can ask for the code straight away. If it cannot be sent, that screen offers to try again.
    const needsPhone = user.phoneRequired && !user.phoneVerifiedAt && (await phoneVerifyMode());
    const phoneCodeSent = needsPhone ? (await resendPhoneCode(user.id).catch(() => ({ ok: false as const }))).ok : false;
    return { ok: true as const, autoCode, needsPhone, phoneCodeSent };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false as const, error: err.message };
    throw err;
  }
}

/** Nothing to resend if already verified, and an unknown address answers the same as a known one. A person who has asked for
 *  several codes in a row IS told to wait: staying silent here once made the button say "sent" while nothing was sent, and
 *  the sign-up screen already says plainly when an address has an account, so this reveals nothing new.
 *  Wrapped in withTimingFloor so the answer takes the same time either way, see requestPasswordResetAction. */
export async function resendVerificationEmailAction(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return withTimingFloor(async () => {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.emailVerified) return { ok: true as const };
    try {
      const sent = await createAndSendCode({ email: user.email, userId: user.id, purpose: "EMAIL_VERIFY" });
      // A failed send is about the email service, not about this account, so it is safe to say so.
      if (!sent.ok) return { ok: false as const, error: "We couldn't send the email just now. Please try again in a minute." };
    } catch (err) {
      if (!(err instanceof RateLimitError)) throw err;
      const minutes = await getNumberSetting("security.codeIssueWindowMinutes");
      return {
        ok: false as const,
        error: `You've asked for several codes in a row, so new ones are paused for about ${minutes} minutes. The newest one we sent still works for a few minutes: check your inbox, and the Promotions, Updates and Spam folders.`,
      };
    }
    return { ok: true as const };
  });
}
