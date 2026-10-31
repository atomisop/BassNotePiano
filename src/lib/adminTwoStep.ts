import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  hashBackupCode,
  isAuthenticatorCode,
  newTotpSecret,
  parseTotpKey,
  totpStep,
  totpUri,
} from "@/lib/totpCore";

/**
 * Admin two-step sign-in. Only an ADMIN can turn it on, and students are never asked for a second step.
 * The wrong-code limit is the existing failed-login lockout (FailedLoginAttempt), counted by the callers in
 * src/app/(auth)/login/actions.ts and src/lib/auth.ts, so a code cannot be guessed past the same limit as a password.
 */

export class TwoStepError extends Error {}

const key = () => parseTotpKey(process.env.ADMIN_TOTP_ENCRYPTION_KEY);
const clean = (s: string) => s.trim().replace(/\s/g, "");

/** True when this account must give a second step to sign in. */
export async function requiresSecondStep(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, totpEnabledAt: true } });
  return u?.role === "ADMIN" && u.totpEnabledAt !== null;
}

/** Starts setup: a new secret, stored encrypted but NOT yet required. Returns what the authenticator app needs. */
export async function beginSetup(userId: string): Promise<{ secret: string; uri: string }> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true, totpEnabledAt: true } });
  if (u?.role !== "ADMIN") throw new TwoStepError("Only the admin can turn this on.");
  if (u.totpEnabledAt) throw new TwoStepError("Two-step sign-in is already on.");
  const secret = newTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: encryptSecret(secret, key()) } });
  return { secret, uri: totpUri(secret, u.email) };
}

/** One valid code proves the app is set up; only then is it required. Returns the backup codes, to be shown once. */
export async function confirmSetup(userId: string, token: string): Promise<string[]> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, totpSecretEnc: true, totpEnabledAt: true } });
  if (u?.role !== "ADMIN" || !u.totpSecretEnc) throw new TwoStepError("Start the setup first.");
  if (u.totpEnabledAt) throw new TwoStepError("Two-step sign-in is already on.");
  const step = totpStep(decryptSecret(u.totpSecretEnc, key()), clean(token));
  if (step === null) throw new TwoStepError("That code did not match. Check the app and try the new code.");
  const codes = generateBackupCodes();
  await prisma.$transaction([
    prisma.adminBackupCode.deleteMany({ where: { userId } }),
    prisma.adminBackupCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashBackupCode(c) })) }),
    prisma.user.update({ where: { id: userId }, data: { totpEnabledAt: new Date(), totpLastStep: step } }),
  ]);
  return codes;
}

/** Turning it off needs the password AND a current code, so a borrowed signed-in screen cannot remove it. */
export async function disableTwoStep(userId: string, password: string, token: string): Promise<void> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, totpEnabledAt: true } });
  if (!u?.totpEnabledAt || !u.passwordHash) throw new TwoStepError("Two-step sign-in is not on.");
  if (!(await bcrypt.compare(password, u.passwordHash))) throw new TwoStepError("That password is not right.");
  if (!(await consumeSecondStep(userId, token))) throw new TwoStepError("That code did not match.");
  await prisma.$transaction([
    prisma.adminBackupCode.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null } }),
  ]);
}

/** A fresh set of backup codes (the old ones stop working). Needs a current authenticator code. */
export async function regenerateBackupCodes(userId: string, token: string): Promise<string[]> {
  if (!(await requiresSecondStep(userId))) throw new TwoStepError("Two-step sign-in is not on.");
  if (!isAuthenticatorCode(token) || !(await consumeSecondStep(userId, token))) throw new TwoStepError("That code did not match.");
  const codes = generateBackupCodes();
  await prisma.$transaction([
    prisma.adminBackupCode.deleteMany({ where: { userId } }),
    prisma.adminBackupCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashBackupCode(c) })) }),
  ]);
  return codes;
}

/** Checks a code WITHOUT using it up (the sign-in form checks first, then the real sign-in uses it). */
export async function peekSecondStep(userId: string, input: string): Promise<boolean> {
  const value = clean(input);
  if (!value) return false;
  if (isAuthenticatorCode(value)) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true, totpLastStep: true } });
    if (!u?.totpSecretEnc) return false;
    const step = totpStep(decryptSecret(u.totpSecretEnc, key()), value);
    return step !== null && step > (u.totpLastStep ?? 0);
  }
  return (await prisma.adminBackupCode.count({ where: { userId, codeHash: hashBackupCode(value), usedAt: null } })) > 0;
}

/**
 * Checks a code and uses it up: an authenticator step is accepted once (a later step only), a backup code once.
 * Both updates are conditional, so two requests with the same code cannot both succeed.
 */
export async function consumeSecondStep(userId: string, input: string): Promise<boolean> {
  const value = clean(input);
  if (!value) return false;
  if (isAuthenticatorCode(value)) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true, totpLastStep: true } });
    if (!u?.totpSecretEnc) return false;
    const step = totpStep(decryptSecret(u.totpSecretEnc, key()), value);
    if (step === null) return false;
    const claimed = await prisma.user.updateMany({
      where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return claimed.count === 1;
  }
  const claimed = await prisma.adminBackupCode.updateMany({
    where: { userId, codeHash: hashBackupCode(value), usedAt: null },
    data: { usedAt: new Date() },
  });
  return claimed.count >= 1;
}

export async function unusedBackupCodeCount(userId: string): Promise<number> {
  return prisma.adminBackupCode.count({ where: { userId, usedAt: null } });
}
