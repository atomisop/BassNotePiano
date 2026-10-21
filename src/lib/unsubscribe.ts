import { createHmac, timingSafeEqual } from "crypto";
import { PREFERENCE_COLUMN, type EmailCategory } from "@/lib/emailPreferences";

/**
 * One-click unsubscribe for the emails people can switch off (Settings > Notification settings). Every such email carries a link
 * made for that person and that kind of email: a keyed hash (HMAC with the app's secret) of who and which, so it cannot be forged
 * or reused for another person, and it needs no sign-in (a reader on their phone should not have to log in to stop an email).
 *
 * The link can only ever turn ONE switch OFF for the person it was made for, so it is safe to leave in an old email. It has two
 * doors: a page with a button (a person clicking, where a mail scanner's automatic visit must change nothing) and a POST endpoint
 * for the "List-Unsubscribe" header (RFC 8058 one-click, which mail apps call themselves).
 */

export const UNSUBSCRIBE_CATEGORY_LABEL: Record<EmailCategory, string> = {
  payments: "payments and invoices",
  roleUpdates: "account updates",
  social: "messages and announcements from the studio",
  classes: "class updates",
  reminders: "practice and class reminders",
};

/** What to tell the person before they confirm, where turning it off has a real consequence. */
export const UNSUBSCRIBE_CATEGORY_NOTE: Partial<Record<EmailCategory, string>> = {
  payments: "You will no longer get bills or overdue reminders by email. A plan that goes unpaid can still lapse, so keep an eye on Billing in the app.",
};

export const EMAIL_CATEGORIES = Object.keys(PREFERENCE_COLUMN) as EmailCategory[];

export function isEmailCategory(value: string): value is EmailCategory {
  return (EMAIL_CATEGORIES as string[]).includes(value);
}

function secret(): string | null {
  return process.env.NEXTAUTH_SECRET ?? (process.env.NODE_ENV === "production" ? null : "dev-only-unsubscribe-secret");
}

export function unsubscribeToken(userId: string, category: EmailCategory): string | null {
  const key = secret();
  if (!key) return null;
  return createHmac("sha256", key).update(`unsubscribe:${userId}:${category}`).digest("base64url");
}

export function verifyUnsubscribeToken(userId: string, category: string, token: string): category is EmailCategory {
  if (!isEmailCategory(category) || typeof token !== "string" || token.length > 200 || userId.length > 64) return false;
  const expected = unsubscribeToken(userId, category);
  if (!expected) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function baseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
}

/** The links for one email: the page a person opens, and the endpoint a mail app posts to. Null when the app has no secret. */
export function unsubscribeLinks(userId: string, category: EmailCategory): { page: string; post: string } | null {
  const token = unsubscribeToken(userId, category);
  if (!token) return null;
  const query = `u=${encodeURIComponent(userId)}&c=${category}&t=${token}`;
  return { page: `${baseUrl()}/unsubscribe?${query}`, post: `${baseUrl()}/api/unsubscribe?${query}` };
}
