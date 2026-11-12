import type { PaymentPlanTerm } from "@prisma/client";

/** Both people get this much off, for this many months, once the invited person pays for a 3 or 6 month plan. */
export const REFERRAL_PERCENT = 10;
export const REFERRAL_MONTHS = 3;

export function isQualifyingReferralTerm(term: PaymentPlanTerm | string): boolean {
  return term === "TERM_3" || term === "TERM_6";
}

// No 0/O/1/I/L: a code read out loud or typed from a screenshot stays unambiguous.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function makeReferralCode(random: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[random(ALPHABET.length)];
  return out;
}

/** Cleans what came from a link or form field; returns null when it cannot be a code. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{8}$/.test(code) ? code : null;
}

/**
 * A reward never lowers what someone already has. An existing discount of the same size or bigger stays as it is (the owner's own
 * discount, or an earlier reward that has longer to run).
 */
export function rewardWouldHelp(existing: { percent: number; expiresAt: Date | null } | null, newExpiresAt: Date): boolean {
  if (!existing) return true;
  // A permanent discount (the owner's own) is never swapped for a timed one: when the timed one ended, the person would be left with none.
  if (existing.expiresAt === null) return false;
  if (existing.percent > REFERRAL_PERCENT) return false;
  if (existing.percent === REFERRAL_PERCENT) return existing.expiresAt !== null && existing.expiresAt.getTime() < newExpiresAt.getTime();
  return true;
}
