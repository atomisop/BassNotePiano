"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyCode, createSilentCode, createAndSendCode, RateLimitError, type VerifyCodeResult } from "@/lib/verification";

const MIN_PASSWORD_LENGTH = 8;

const REASON_MESSAGES: Record<string, string> = {
  not_found: "We couldn't find an active code for this email. Request a new one.",
  expired: "That code has expired. Request a new one.",
  too_many_attempts: "Too many incorrect attempts. Request a new code.",
  incorrect: "That code isn't right. Double-check and try again.",
};

export async function resetPasswordAction(email: string, code: string, newPassword: string) {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false as const, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const result: VerifyCodeResult = await verifyCode(email, "PASSWORD_RESET", code);
  if (!result.ok) {
    return { ok: false as const, error: REASON_MESSAGES[result.reason] };
  }
  if (!result.userId) {
    return { ok: false as const, error: "Something went wrong. Request a new code." };
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: result.userId! },
      data: { passwordHash },
      select: { id: true, email: true },
    });
    // A password reset means the old password may have been compromised —
    // any "remember me" trust established under it shouldn't carry over.
    await tx.trustedDevice.deleteMany({ where: { userId: updated.id } });
    return updated;
  });

  try {
    const { code: autoCode } = await createSilentCode({ email: user.email, userId: user.id, purpose: "LOGIN_2FA" });
    return { ok: true as const, autoCode };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false as const, error: err.message };
    throw err;
  }
}

/** Doesn't leak account existence — a RateLimitError is swallowed for the
 *  same reason as forgot-password's requestPasswordResetAction. */
export async function resendResetCodeAction(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user?.passwordHash) return;
  try {
    await createAndSendCode({ email: user.email, userId: user.id, purpose: "PASSWORD_RESET" });
  } catch (err) {
    if (!(err instanceof RateLimitError)) throw err;
  }
}
