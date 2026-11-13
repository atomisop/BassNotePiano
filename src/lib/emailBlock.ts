import { canonicalEmail } from "@/lib/canonicalEmail";

/**
 * Addresses the app never emails, apart from verification codes (sign-in, reset and the other code-gated actions).
 * The owner's address is always blocked; EMAIL_BLOCKED_RECIPIENTS adds more (comma separated).
 * Compared by canonicalEmail, so dots and plus tags in a Gmail address do not get around it.
 */
function blockedRecipients(): Set<string> {
  const owner = process.env.OWNER_EMAIL ?? "isaacberhanu777@gmail.com";
  const extra = (process.env.EMAIL_BLOCKED_RECIPIENTS ?? "").split(",");
  return new Set([owner, ...extra].map((a) => a.trim()).filter(Boolean).map(canonicalEmail));
}

export function isEmailBlocked(to: string): boolean {
  return blockedRecipients().has(canonicalEmail(to));
}
