import { createHash, randomInt } from "crypto";
import type { Prisma, VerificationPurpose } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendVerificationCodeEmail } from "@/lib/email";

const CODE_EXPIRY_MINUTES = 10;
const MAX_VERIFICATION_ATTEMPTS = 5;

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export interface CreateCodeParams {
  email: string;
  userId?: string;
  purpose: VerificationPurpose;
  /** Pending value for CHANGE_* purposes — applied only once the code is confirmed. */
  payload?: Prisma.InputJsonValue;
}

/** Shared row-creation logic — invalidates any still-open code for the same email+purpose first, so only the most recently issued code is ever valid. */
async function issueCode({ email, userId, purpose, payload }: CreateCodeParams) {
  const normalizedEmail = email.toLowerCase();

  await prisma.verificationCode.updateMany({
    where: { email: normalizedEmail, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateCode();
  const record = await prisma.verificationCode.create({
    data: {
      email: normalizedEmail,
      userId,
      purpose,
      payload,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000),
    },
  });

  return { record, code, normalizedEmail };
}

/**
 * Issues a fresh 6-digit code and emails it — the normal path for a real
 * verification/2FA/reset request. The code row is written regardless (a
 * transient email-provider failure shouldn't corrupt the pending-change
 * state), but the send itself is caught rather than left to throw — an
 * external API hiccup should surface as a friendly "try again" to the
 * caller, not an unhandled 500 crashing the page mid-flow.
 */
export async function createAndSendCode(params: CreateCodeParams): Promise<{ ok: true } | { ok: false }> {
  const { code, normalizedEmail } = await issueCode(params);
  try {
    await sendVerificationCodeEmail(normalizedEmail, params.purpose, code);
    return { ok: true };
  } catch (err) {
    console.error(`Failed to send ${params.purpose} code to ${normalizedEmail}:`, err);
    return { ok: false };
  }
}

/**
 * Issues a fresh code WITHOUT emailing it, returning the raw code to the
 * caller instead. Only ever used when the caller has already established
 * trust through some other channel in the same request — a validated
 * trusted-device cookie, or a just-confirmed EMAIL_VERIFY code — so the
 * caller can immediately turn around and submit this code to sign in, with
 * no second round trip through email.
 */
export async function createSilentCode(params: CreateCodeParams) {
  const { record, code } = await issueCode(params);
  return { record, code };
}

export interface VerifyCodeSuccess {
  ok: true;
  userId: string | null;
  payload: Prisma.JsonValue | null;
}

export interface VerifyCodeFailure {
  ok: false;
  reason: "not_found" | "expired" | "too_many_attempts" | "incorrect";
}

export type VerifyCodeResult = VerifyCodeSuccess | VerifyCodeFailure;

/**
 * Checks a submitted code against the most recent open one for this
 * email+purpose. Wrong guesses count against a 5-attempt limit before the
 * code is invalidated outright, forcing a fresh one to be requested.
 */
export async function verifyCode(email: string, purpose: VerificationPurpose, submittedCode: string): Promise<VerifyCodeResult> {
  const normalizedEmail = email.toLowerCase();

  const record = await prisma.verificationCode.findFirst({
    where: { email: normalizedEmail, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return { ok: false, reason: "not_found" };
  if (record.expiresAt < new Date()) return { ok: false, reason: "expired" };
  if (record.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    await prisma.verificationCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    return { ok: false, reason: "too_many_attempts" };
  }

  if (hashCode(submittedCode) !== record.codeHash) {
    await prisma.verificationCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, reason: "incorrect" };
  }

  await prisma.verificationCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  return { ok: true, userId: record.userId, payload: record.payload };
}
