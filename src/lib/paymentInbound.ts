import { timingSafeEqual } from "crypto";

// Pure helpers for bank, Zelle and Venmo emails that arrive by being FORWARDED to a private address on the owner's Mailgun
// inbox (src/app/api/inbound/payments/route.ts), instead of being polled out of Gmail by the Apps Script. No database here,
// so all of it is unit tested.

/** One id for one email, whichever way it arrived: no angle brackets, lowercase, trimmed. */
export function normalizeMessageId(id: string): string {
  return id.trim().replace(/^<|>$/g, "").toLowerCase().slice(0, 200);
}

/**
 * The private payments address is `pay-<token>@inbox.bassnotepiano.com` (any bassnotepiano.com subdomain). The token is
 * known only to the owner's Gmail filter and Mailgun route, so a stranger cannot even reach the payment code.
 */
export function isPaymentInboxRecipient(recipient: string, token: string | undefined): boolean {
  if (!token || token.length < 16) return false;
  const match = /^([^@\s]+)@([a-z0-9-]+\.)*bassnotepiano\.com$/i.exec(recipient.trim());
  if (!match) return false;
  const a = Buffer.from(match[1].toLowerCase());
  const b = Buffer.from(`pay-${token}`.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The `d=` domain of every DKIM-Signature header in Mailgun's `message-headers` JSON. */
export function dkimSignatureDomains(rawHeaders: string | null | undefined): string[] {
  const domains: string[] = [];
  if (!rawHeaders) return domains;
  try {
    const parsed: unknown = JSON.parse(rawHeaders);
    if (!Array.isArray(parsed)) return domains;
    for (const pair of parsed) {
      if (Array.isArray(pair) && typeof pair[0] === "string" && pair[0].toLowerCase() === "dkim-signature" && typeof pair[1] === "string") {
        const d = /(?:^|[;\s])d=([a-z0-9.-]+)/i.exec(pair[1]);
        if (d) domains.push(d[1].toLowerCase());
      }
    }
  } catch {
    // Unreadable headers count as no signatures.
  }
  return domains;
}

/** True when `signedDomain` is the sender's own domain or a parent of it (sofi.com signs mail from notifications.sofi.com). */
export function domainAligned(signedDomain: string, fromDomain: string): boolean {
  const s = signedDomain.toLowerCase();
  const f = fromDomain.toLowerCase();
  return s === f || f.endsWith(`.${s}`);
}

export interface ForwardCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Proof that a forwarded email really came from the bank it says it did. Forwarding breaks the sender's SPF check, but
 * the bank's DKIM signature on the unchanged message survives. So two things must hold: Mailgun reports its DKIM check
 * as passed, AND a signature on the message belongs to the sender's own domain (so a message signed by some other
 * domain, with a forged From, is refused). The private address and Mailgun's request signature stand in front of this.
 */
export function checkForwardedBankMail(input: { fromEmail: string; dkimResult: string | undefined; rawHeaders: string | null | undefined }): ForwardCheck {
  if (input.dkimResult?.trim().toLowerCase() !== "pass") return { ok: false, reason: "its signature check did not pass" };
  const fromDomain = input.fromEmail.split("@")[1]?.toLowerCase();
  if (!fromDomain) return { ok: false, reason: "it has no sender address" };
  const signed = dkimSignatureDomains(input.rawHeaders);
  if (!signed.some((d) => domainAligned(d, fromDomain))) return { ok: false, reason: `no signature belongs to ${fromDomain}` };
  return { ok: true };
}

/** Plain text of an email: the plain part when there is one, otherwise the HTML with tags and entities stripped. */
export function emailBodyText(plain: string, html: string): string {
  if (plain.trim()) return plain;
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}
