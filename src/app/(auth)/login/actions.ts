"use server";

import { getNumberSetting } from "@/lib/siteSettings";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createAndSendCode, createSilentCode, RateLimitError as CodeRateLimitError } from "@/lib/verification";
import { assertRateLimit, RateLimitError as LockoutError } from "@/lib/rateLimit";
import { withTimingFloor } from "@/lib/timingSafe";
import { BANNED_MESSAGE } from "@/lib/ban";
import { peekSecondStep } from "@/lib/adminTwoStep";
import { maybeAlertFailedLogins } from "@/lib/loginAlerts";

export type LoginStepOneResult =
  | { ok: false; error: string }
  | { ok: true; needsEmailVerification: true }
  | { ok: true; needsSecondStep: true }
  | { ok: true; needsEmailVerification: false; autoCode: string };

const GENERIC_CREDENTIALS_ERROR = "Invalid email or password.";
const LOCKOUT_MESSAGE = "Too many failed attempts on this account. Wait a little while and try again, or reset your password.";

// STEP 26 security audit: nothing previously stopped unlimited password
// guesses against a single account, bcrypt's own cost slows each guess
// down a little, but that's not a real limit. FailedLoginAttempt is a
// dedicated table (not reused from LoginEvent, which only ever recorded
// successful logins and requires a real userId, a guess against an email
// with no account still needs to count against something).
// The window and the number of wrong passwords are admin settings (Settings → Security).

async function recordFailedAttempt(email: string): Promise<void> {
  try {
    await prisma.failedLoginAttempt.create({ data: { email } });
    await maybeAlertFailedLogins();
  } catch (err) {
    // Never let a failure to log the attempt block the (correct) error
    // response the user is about to get, same "non-blocking" posture as
    // every other audit-ish side effect in this codebase.
    console.error("Failed to record failed login attempt (non-blocking):", err);
  }
}

/**
 * Verifies the password (the only place it's ever checked) and decides what
 * happens next:
 *  - unverified account → send a fresh EMAIL_VERIFY code, tell the client to
 *    route to /verify-email. This is the one login-adjacent flow that still
 *    requires a code, since it's really "finish creating your account."
 *  - verified account → issue a LOGIN_2FA code silently (never emailed) and
 *    hand the raw code back so the client can sign in with it immediately.
 *    NextAuth's CredentialsProvider (see auth.ts) still only ever accepts a
 *    LOGIN_2FA code, this keeps that contract intact while making login
 *    itself single-step and code-free from the user's perspective, per the
 *    2026-08-07 decision to only require a code for account creation and
 *    password reset.
 *
 * Wrapped in withTimingFloor: the early return below for an email with no
 * account is fast (one lookup), while a real account goes on to a bcrypt
 * compare and possibly a real email send, without the floor, that gap is
 * measurable in response time even though every branch's response body
 * already treats both cases identically.
 */
export async function loginStepOneAction(email: string, password: string, secondStep?: string): Promise<LoginStepOneResult> {
  return withTimingFloor(() => loginStepOneWork(email, password, secondStep));
}

const SECOND_STEP_ERROR = "That code didn't work. Check it, or use one of your backup codes.";

async function loginStepOneWork(email: string, password: string, secondStep?: string): Promise<LoginStepOneResult> {
  const normalizedEmail = email.trim().toLowerCase();

  // Checked before the user lookup or any bcrypt work, so a locked-out
  // caller can't keep burning compute (or probing which emails exist) by
  // guessing past the limit.
  try {
    await assertRateLimit(
      prisma.failedLoginAttempt.count,
      { email: normalizedEmail },
      {
        windowMinutes: await getNumberSetting("security.loginLockoutMinutes"),
        max: await getNumberSetting("security.loginMaxAttempts"),
        message: LOCKOUT_MESSAGE,
      },
    );
  } catch (err) {
    if (err instanceof LockoutError) return { ok: false, error: err.message };
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user?.passwordHash) {
    await recordFailedAttempt(normalizedEmail);
    return { ok: false, error: GENERIC_CREDENTIALS_ERROR };
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    await recordFailedAttempt(normalizedEmail);
    return { ok: false, error: GENERIC_CREDENTIALS_ERROR };
  }

  // Said only after the right password, so it cannot be used to find out which emails are banned.
  if (user.bannedAt) return { ok: false, error: BANNED_MESSAGE };

  // An admin with two-step sign-in on is asked for the second step only AFTER the right password, so nothing
  // here tells anyone whether an account exists. No sign-in code is issued until the second step is right, and the
  // sign-in itself (auth.ts authorize) checks it again, so no other route can skip it. A wrong code counts toward
  // the same lockout as a wrong password.
  if (user.role === "ADMIN" && user.totpEnabledAt) {
    if (!secondStep?.trim()) return { ok: true, needsSecondStep: true };
    if (!(await peekSecondStep(user.id, secondStep))) {
      await recordFailedAttempt(normalizedEmail);
      return { ok: false, error: SECOND_STEP_ERROR };
    }
  }

  try {
    if (!user.emailVerified) {
      const sendResult = await createAndSendCode({ email: user.email, userId: user.id, purpose: "EMAIL_VERIFY" });
      if (!sendResult.ok) return { ok: false, error: "Couldn't send the verification email. Try again in a moment." };
      return { ok: true, needsEmailVerification: true };
    }

    const { code } = await createSilentCode({ email: user.email, userId: user.id, purpose: "LOGIN_2FA" });
    return { ok: true, needsEmailVerification: false, autoCode: code };
  } catch (err) {
    if (err instanceof CodeRateLimitError) return { ok: false, error: err.message };
    throw err;
  }
}

// ---------------------------------------------------------------------------
// "Email me a code instead": the passwordless way in.
// ---------------------------------------------------------------------------

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Emails a 6-digit sign-in code to a verified account. The answer is always
 * the same ({ ok: true }) whether or not the address has an account, whether a
 * code was actually sent, and even when the per-email request limit was hit, so
 * this can't be used to find out which emails are registered; the timing floor
 * covers the response-time gap the same way loginStepOneAction does. Request
 * volume is capped per email by the shared code issuer (5 per 15 minutes), and
 * guessing the code is capped by the failed-attempt lockout checked in the
 * NextAuth authorize step (src/lib/auth.ts), which this code is verified in.
 * Only a verified address can be signed into this way.
 */
export async function requestLoginCodeAction(email: string): Promise<{ ok: true }> {
  return withTimingFloor(async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(normalizedEmail)) return { ok: true as const };

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    // Admin accounts always need their password: an inbox alone is not enough to reach them.
    if (!user || !user.emailVerified || user.role === "ADMIN") return { ok: true as const };

    try {
      await createAndSendCode({ email: user.email, userId: user.id, purpose: "LOGIN_2FA" });
    } catch (err) {
      if (!(err instanceof CodeRateLimitError)) console.error("Login code request failed (non-blocking):", err);
    }
    return { ok: true as const };
  });
}
