"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createAndSendCode, createSilentCode } from "@/lib/verification";

export type LoginStepOneResult =
  | { ok: false; error: string }
  | { ok: true; needsEmailVerification: true }
  | { ok: true; needsEmailVerification: false; autoCode: string };

const GENERIC_CREDENTIALS_ERROR = "Invalid email or password.";

/**
 * Verifies the password (the only place it's ever checked) and decides what
 * happens next:
 *  - unverified account → send a fresh EMAIL_VERIFY code, tell the client to
 *    route to /verify-email. This is the one login-adjacent flow that still
 *    requires a code, since it's really "finish creating your account."
 *  - verified account → issue a LOGIN_2FA code silently (never emailed) and
 *    hand the raw code back so the client can sign in with it immediately.
 *    NextAuth's CredentialsProvider (see auth.ts) still only ever accepts a
 *    LOGIN_2FA code — this keeps that contract intact while making login
 *    itself single-step and code-free from the user's perspective, per the
 *    2026-08-07 decision to only require a code for account creation and
 *    password reset.
 */
export async function loginStepOneAction(email: string, password: string): Promise<LoginStepOneResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user?.passwordHash) return { ok: false, error: GENERIC_CREDENTIALS_ERROR };

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) return { ok: false, error: GENERIC_CREDENTIALS_ERROR };

  if (!user.emailVerified) {
    const sendResult = await createAndSendCode({ email: user.email, userId: user.id, purpose: "EMAIL_VERIFY" });
    if (!sendResult.ok) return { ok: false, error: "Couldn't send the verification email. Try again in a moment." };
    return { ok: true, needsEmailVerification: true };
  }

  const { code } = await createSilentCode({ email: user.email, userId: user.id, purpose: "LOGIN_2FA" });
  return { ok: true, needsEmailVerification: false, autoCode: code };
}
