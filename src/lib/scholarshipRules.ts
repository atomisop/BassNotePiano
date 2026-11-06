import { randomInt } from "crypto";

/** Pure rules for scholarship codes (no database), so they are tested on their own. */

export const SCHOLARSHIP_CODE_LENGTH = 16;
/** A scholarship takes 1 to this percent off the 6 Month plan; 100 makes it free. */
export { MAX_SCHOLARSHIP_PERCENT } from "@/lib/classCreditPricing";

/** A random 16 digit code. Uses the system's secure random source, never Math.random. */
export function makeScholarshipCode(): string {
  let out = "";
  for (let i = 0; i < SCHOLARSHIP_CODE_LENGTH; i++) out += String(randomInt(0, 10));
  return out;
}

/** Whatever a person typed or pasted ("1234 5678-9012 3456") down to the digits; null when it is not exactly 16. */
export function normalizeScholarshipCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[\s-]/g, "");
  return /^\d{16}$/.test(digits) ? digits : null;
}

/** "1234 5678 9012 3456" for display. */
export function formatScholarshipCode(code: string): string {
  return code.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export type ScholarshipStatus = "available" | "claimed" | "ended" | "expired" | "revoked";

export function scholarshipStatus(row: { claimedAt: Date | null; revokedAt: Date | null; expiresAt: Date | null }, now: Date = new Date()): ScholarshipStatus {
  if (row.claimedAt) return row.revokedAt ? "ended" : "claimed";
  if (row.revokedAt) return "revoked";
  if (row.expiresAt && row.expiresAt <= now) return "expired";
  return "available";
}
