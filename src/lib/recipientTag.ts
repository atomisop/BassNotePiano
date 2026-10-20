/**
 * "Who is this link for?" Every link in an email that points into the app carries a short tag made from the address
 * the email was sent to (and a masked copy of that address for the message shown on a mismatch). When someone opens
 * the link while signed in as a DIFFERENT account, the app stops and says so instead of showing that other
 * account's screen (a bill, a plan, a message) as if it were the one the email was about.
 *
 * The tag is a keyed hash (HMAC with the app's secret), so it cannot be forged for another address and does not
 * reveal the address. It is only a hint for this check: signing in is still what protects the data. Works in the
 * browser-less edge runtime too (Web Crypto only), because the middleware checks it.
 */

export const RECIPIENT_PARAM = "r";
export const RECIPIENT_HINT_PARAM = "rm";

const encoder = new TextEncoder();

function canonical(email: string): string {
  return email.trim().toLowerCase();
}

/** A keyed fingerprint of an email address, or null when the app has no secret to key it with. */
export async function recipientTag(email: string): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`recipient:${canonical(email)}`));
  return Array.from(new Uint8Array(signature))
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** "sean.weinberg8@gmail.com" becomes "s***8@gmail.com": enough to recognize, not enough to harvest. */
export function maskEmail(email: string): string {
  const [local, domain] = canonical(email).split("@");
  if (!domain) return "an account";
  const head = local.slice(0, 1);
  const tail = local.length > 2 ? local.slice(-1) : "";
  return `${head}***${tail}@${domain}`;
}

// Links that are not a signed-in screen: public auth steps (already tied to their own one-time token), API routes
// and files. They are left alone.
const UNTAGGED_PATHS = /^\/(api|login|register|forgot-password|reset-password|verify-email|verify-phone)(\/|$|\?)/;

/** Adds the recipient tag to every in-app link in an email's HTML or text. */
export async function tagAppLinks(content: string, to: string): Promise<string> {
  const base = process.env.NEXTAUTH_URL?.replace(/\/+$/, "");
  const tag = await recipientTag(to);
  if (!base || !tag) return content;
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escapedBase}(/[^\\s"'<>)]*)?`, "g");
  return content.replace(pattern, (match, path: string | undefined) => {
    const target = path ?? "/";
    if (UNTAGGED_PATHS.test(target) || /\.[a-z0-9]{2,5}($|\?|#)/i.test(target.split("?")[0])) return match;
    try {
      const url = new URL(match);
      url.searchParams.set(RECIPIENT_PARAM, tag);
      url.searchParams.set(RECIPIENT_HINT_PARAM, maskEmail(to));
      return url.toString();
    } catch {
      return match;
    }
  });
}

/**
 * True when a link carries a recipient tag that does not belong to the signed-in account. A link with no tag, or a
 * signed-in account we cannot fingerprint, is never a mismatch (that would only block ordinary use).
 */
export async function isWrongRecipient(search: URLSearchParams, signedInEmail: string | null | undefined): Promise<boolean> {
  const claimed = search.get(RECIPIENT_PARAM);
  if (!claimed || !signedInEmail) return false;
  const mine = await recipientTag(signedInEmail);
  return mine !== null && mine !== claimed;
}
