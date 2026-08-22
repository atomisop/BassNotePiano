"use server";

import { prisma } from "@/lib/prisma";
import { createAndSendCode, RateLimitError } from "@/lib/verification";

/**
 * Never reveals whether the email is registered — same response either way.
 * A RateLimitError has to be swallowed here for the same reason: letting it
 * throw through would make a rate-limited request observably different from
 * an "email not registered" one, which is exactly the distinction this
 * function exists to hide. The limiter still does its job either way — the
 * new code genuinely isn't issued — it just can't be reported.
 */
export async function requestPasswordResetAction(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (user?.passwordHash) {
    try {
      await createAndSendCode({ email: user.email, userId: user.id, purpose: "PASSWORD_RESET" });
    } catch (err) {
      if (!(err instanceof RateLimitError)) throw err;
    }
  }
}
