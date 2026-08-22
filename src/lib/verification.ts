import { createHash, randomInt } from "crypto";
import type { Prisma, VerificationPurpose } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendVerificationCodeEmail } from "@/lib/email";

const CODE_EXPIRY_MINUTES = 10;
const MAX_VERIFICATION_ATTEMPTS = 5;

// Throttles how often a NEW code can be requested for the same email+purpose
// — separate from MAX_VERIFICATION_ATTEMPTS above, which throttles GUESSES
// against one already-issued code. That guess limit was already solid (5
// wrong guesses invalidates the code); this was the real gap the Step 4
// security audit found — nothing stopped repeated calls to
// createAndSendCode()/createSilentCode() itself, which register, login, and
// password reset all funnel through. Fixing it here, in the one shared
// choke point, covers all three flows without duplicating logic three times
// or standing up a new rate-limit table (this reuses the [email, purpose]
// index the VerificationCode model already has).
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_ISSUANCES = 5;

export class RateLimitError extends Error {
  constructor() {
    super("Too many codes requested for this email — please wait a few minutes and try again.");
    this.name = "RateLimitError";
  }
}

async function assertNotRateLimited(email: string, purpose: VerificationPurpose) {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
  const recentCount = await prisma.verificationCode.count({
    where: { email: email.toLowerCase(), purpose, createdAt: { gte: windowStart } },
  });
  if (recentCount >= RATE_LIMIT_MAX_ISSUANCES) {
    throw new RateLimitError();
  }
}

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

  await assertNotRateLimited(normalizedEmail, purpose);

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
