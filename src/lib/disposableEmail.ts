import exactDomains from "disposable-email-domains";
import wildcardDomains from "disposable-email-domains/wildcard.json";

/**
 * Blocks registration with a free/quick/temporary email address, per direct
 * instruction: someone using a burner inbox to sign up is either avoiding
 * accountability (the verification code, receipts, and Zelle payment
 * confirmations this app already sends by email all depend on the address
 * actually belonging to the student) or gaming a feature that keys off a
 * "real, existing account" (the family bundle recipient check in
 * payments.ts exists for exactly the same reason).
 *
 * `disposable-email-domains` (MIT, zero dependencies, ~120k domains,
 * community-maintained) rather than a hand-rolled list: mailinator.com's
 * competitors number in the thousands and turn over constantly, which isn't
 * something to keep pace with by hand. Two shapes in the package: exact
 * domains (index.json) and wildcard base domains (wildcard.json) where any
 * subdomain also counts, e.g. `foo.33mail.com` is disposable because
 * `33mail.com` is a wildcard entry, not because `foo.33mail.com` itself is
 * individually listed.
 */
const EXACT_DOMAINS = new Set(exactDomains.map((domain) => domain.toLowerCase()));
const WILDCARD_DOMAINS = wildcardDomains.map((domain) => domain.toLowerCase());

export function isDisposableEmailDomain(email: string): boolean {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) return false;
  const domain = email.slice(atIndex + 1).trim().toLowerCase();
  if (!domain) return false;

  if (EXACT_DOMAINS.has(domain)) return true;
  return WILDCARD_DOMAINS.some((base) => domain === base || domain.endsWith(`.${base}`));
}
