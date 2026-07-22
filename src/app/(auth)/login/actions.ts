"use server";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createAndSendCode, createSilentCode } from "@/lib/verification";
import { isTrustedDevice, createTrustedDevice, TRUSTED_DEVICE_COOKIE, TRUSTED_DEVICE_DAYS } from "@/lib/trusted-device";

export type LoginStepOneResult =
  | { ok: false; error: string }
  | { ok: true; needsEmailVerification: true }
  | { ok: true; needsEmailVerification: false; autoCode: string | null };

const GENERIC_CREDENTIALS_ERROR = "Invalid email or password.";

/**
 * Verifies the password (the only place it's ever checked) and decides what
 * happens next:
 *  - unverified account → send a fresh EMAIL_VERIFY code, tell the client to
 *    route to /verify-email instead of the 2FA screen.
 *  - trusted device (valid remember-me cookie) → issue a LOGIN_2FA code
 *    silently and hand the raw code back so the client can sign in with it
 *    immediately, with no code-entry screen shown.
 *  - anything else → email a real LOGIN_2FA code and tell the client to show
 *    the code-entry screen.
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

  const deviceToken = cookies().get(TRUSTED_DEVICE_COOKIE)?.value;
  const trusted = await isTrustedDevice(user.id, deviceToken);

  if (trusted) {
    const { code } = await createSilentCode({ email: user.email, userId: user.id, purpose: "LOGIN_2FA" });
    return { ok: true, needsEmailVerification: false, autoCode: code };
  }

  const sendResult = await createAndSendCode({ email: user.email, userId: user.id, purpose: "LOGIN_2FA" });
  if (!sendResult.ok) return { ok: false, error: "Couldn't send your login code. Try again in a moment." };
  return { ok: true, needsEmailVerification: false, autoCode: null };
}

export async function resendLoginCodeAction(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return;
  await createAndSendCode({ email: user.email, userId: user.id, purpose: "LOGIN_2FA" });
}

/** Called right after a successful sign-in when "remember me" was checked. */
export async function createTrustedDeviceAction(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return;

  const token = await createTrustedDevice(user.id);
  cookies().set(TRUSTED_DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TRUSTED_DEVICE_DAYS * 24 * 60 * 60,
  });
}
