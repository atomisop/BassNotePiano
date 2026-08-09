"use server";

import { prisma } from "@/lib/prisma";
import { verifyCode, createAndSendCode, createSilentCode, type VerifyCodeResult } from "@/lib/verification";
import { sendWelcomeEmail } from "@/lib/email";

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
    select: { id: true, email: true, name: true },
  });

  // First real proof the account is fully created — a one-time welcome
  // email, not routed through the notification-preference system since
  // there's no in-app equivalent and no opt-out that would make sense here.
  // Non-blocking: a failed welcome email should never stop verification
  // from succeeding.
  sendWelcomeEmail(user.email, user.name).catch((err) => console.error("Welcome email failed (non-blocking):", err));

  // Verifying the email is itself proof enough to log in immediately —
  // issue a fresh LOGIN_2FA code silently (never emailed) so the client can
  // turn around and sign in with it in the same flow, no second code needed.
  const { code: autoCode } = await createSilentCode({ email: user.email, userId: user.id, purpose: "LOGIN_2FA" });
  return { ok: true as const, autoCode };
}

export async function resendVerificationEmailAction(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || user.emailVerified) return; // don't leak account existence; nothing to resend if already verified
  await createAndSendCode({ email: user.email, userId: user.id, purpose: "EMAIL_VERIFY" });
}
