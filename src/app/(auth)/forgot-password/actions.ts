"use server";

import { prisma } from "@/lib/prisma";
import { createAndSendCode } from "@/lib/verification";

/** Never reveals whether the email is registered — same response either way. */
export async function requestPasswordResetAction(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (user?.passwordHash) {
    await createAndSendCode({ email: user.email, userId: user.id, purpose: "PASSWORD_RESET" });
  }
}
