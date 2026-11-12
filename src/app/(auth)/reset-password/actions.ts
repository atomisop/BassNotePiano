"use server";

import { passwordRequirementError } from "@/lib/passwordRules";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyCode, createSilentCode, createAndSendCode, RateLimitError, type VerifyCodeResult } from "@/lib/verification";
import { withTimingFloor } from "@/lib/timingSafe";
import { sendPasswordChangedEmail } from "@/lib/email";


const REASON_MESSAGES: Record<string, string> = {
  not_found: "We couldn't find an active code for this email. Request a new one.",
  expired: "That code has expired. Request a new one.",
  too_many_attempts: "Too many incorrect attempts. Request a new code.",
  incorrect: "That code isn't right. Double-check and try again.",
};

export async function resetPasswordAction(email: string, code: string, newPassword: string) {
  const passwordError = passwordRequirementError(newPassword);
  if (passwordError) {
    return { ok: false as const, error: passwordError };
  }

  const result: VerifyCodeResult = await verifyCode(email, "PASSWORD_RESET", code);
  if (!result.ok) {
    return { ok: false as const, error: REASON_MESSAGES[result.reason] };
  }
  if (!result.userId) {
    return { ok: false as const, error: "Something went wrong. Request a new code." };
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  // The code was sent to ONE address, so it may reset only the account still sitting at that address (an account moved to another
  // address since, see changeSignupEmailAction, must not be reset, or signed in, by a code that went to the old one).
  const address = email.trim().toLowerCase();
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: result.userId!, email: address },
      // Bumping sessionVersion signs out every device holding an older
      // token: the point of resetting a password is often "someone else
      // may have my account", and a stolen session must not survive it.
      data: { passwordHash, passwordChangedAt: new Date(), sessionVersion: { increment: 1 } },
      select: { id: true, email: true, name: true },
    });
    return updated;
  }).catch((err) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return null;
    throw err;
  });
  if (!user) return { ok: false as const, error: "Something went wrong. Request a new code." };

  try {
    await sendPasswordChangedEmail(user.email, user.name);
  } catch (err) {
    console.error("Failed to send password-changed notice:", err);
  }

  try {
    const { code: autoCode } = await createSilentCode({ email: user.email, userId: user.id, purpose: "LOGIN_2FA" });
    return { ok: true as const, autoCode };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false as const, error: err.message };
    throw err;
  }
}

/** Doesn't leak account existence, a RateLimitError is swallowed for the
 *  same reason as forgot-password's requestPasswordResetAction. Wrapped in
 *  withTimingFloor for the same reason too: the early return for "no such
 *  account" is fast, while a real account goes on to a real email send,
 *  without the floor, that gap is measurable in response time alone. */
export async function resendResetCodeAction(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return withTimingFloor(async () => {
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user?.passwordHash) return { ok: true as const };
    try {
      const sent = await createAndSendCode({ email: user.email, userId: user.id, purpose: "PASSWORD_RESET" });
      // A failed send is about the email service, not about this account, so it is safe to say so.
      if (!sent.ok) return { ok: false as const, error: "We couldn't send the email just now. Please try again in a minute." };
    } catch (err) {
      if (!(err instanceof RateLimitError)) throw err;
    }
    return { ok: true as const };
  });
}
