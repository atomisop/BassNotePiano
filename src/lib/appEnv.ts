/**
 * Which copy of the app this is. "staging" is the safe testing area (its own site and its own database): a visible STAGING tag, hidden from
 * search engines, and no email to anyone outside the test allow-list. Set APP_ENV=staging (and NEXT_PUBLIC_APP_ENV=staging, which the
 * browser reads) on the staging deploy only; production leaves both unset.
 */
export type AppEnv = "staging" | "production" | "development";

export function appEnv(): AppEnv {
  const v = (process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? "").trim().toLowerCase();
  if (v === "staging") return "staging";
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export const isStaging = (): boolean => appEnv() === "staging";

const DEFAULT_ALLOWED = ["@bnp-test.local", "@example.test", "@example.com"];

/** True when staging may send a real email to this address: only test domains, plus anything in STAGING_EMAIL_ALLOWLIST (comma separated addresses or @domains). */
export function stagingMayEmail(to: string, allowlist = process.env.STAGING_EMAIL_ALLOWLIST): boolean {
  const address = to.trim().toLowerCase();
  const entries = [...DEFAULT_ALLOWED, ...(allowlist ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)];
  return entries.some((entry) => (entry.startsWith("@") ? address.endsWith(entry) : address === entry));
}
