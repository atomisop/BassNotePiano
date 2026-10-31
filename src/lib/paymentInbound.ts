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

/**
 * What Gmail itself recorded when the bank's email reached it (the first ARC-Authentication-Results, set by mx.google.com): true when it
 * saw a passing DKIM signature from the sender's own domain. Anyone could write that header, so it never approves anything: it is a
 * hint the owner sees on a held payment ("Gmail says the bank's signature passed"), which is almost always the case when forwarding broke
 * Mailgun's own check.
 */
export function gmailSawBankSignature(rawHeaders: string | null | undefined, fromEmail: string): boolean {
  const fromDomain = fromEmail.split("@")[1]?.toLowerCase();
  if (!rawHeaders || !fromDomain) return false;
  try {
    const parsed: unknown = JSON.parse(rawHeaders);
    if (!Array.isArray(parsed)) return false;
    const values = parsed
      .filter((pair): pair is [string, string] => Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string" && pair[0].toLowerCase() === "arc-authentication-results")
      .map((pair) => pair[1]);
    // i=1 is the first hop: Google's own check of the message as the bank sent it.
    const first = values.find((v) => /(?:^|\s)i=1\b/.test(v) && /mx\.google\.com/i.test(v));
    if (!first) return false;
    const dkimPass = /dkim=pass[^;]*/gi;
    for (const match of first.matchAll(dkimPass)) {
      const d = /header\.(?:d|i)=@?([a-z0-9.-]+)/i.exec(match[0]);
      if (d && domainAligned(d[1].toLowerCase(), fromDomain)) return true;
    }
  } catch {
    // Unreadable headers count as nothing seen.
  }
  return false;
}

export interface ForwardCheck {
  ok: boolean;
  reason?: string;
  /** Gmail recorded a passing bank signature (see gmailSawBankSignature); only a hint, never trusted to approve. */
  gmailSawBankSignature?: boolean;
  /**
   * Mailgun gave NO verdict at all (not a failure), the message carries a signature from the sender's own domain, and Gmail recorded the bank's
   * signature as passing. Such an email may be read like a verified one, but anything it settles stays in the owner's "unchecked" list.
   */
  soft?: boolean;
}

/**
 * Proof that a forwarded email really came from the bank it says it did. Forwarding breaks the sender's SPF check, but
 * the bank's DKIM signature on the unchanged message survives. So two things must hold: Mailgun reports its DKIM check
 * as passed, AND a signature on the message belongs to the sender's own domain (so a message signed by some other
 * domain, with a forged From, is refused). The private address and Mailgun's request signature stand in front of this.
 */
export function checkForwardedBankMail(input: { fromEmail: string; dkimResult: string | undefined; rawHeaders: string | null | undefined }): ForwardCheck {
  const signed = dkimSignatureDomains(input.rawHeaders);
  if (input.dkimResult?.trim().toLowerCase() !== "pass") {
    // Say what Mailgun reported and which signatures the message carried, so a failure can be traced without a lookup.
    const reported = input.dkimResult?.trim() ? `Mailgun reported "${input.dkimResult.trim().slice(0, 40)}"` : "Mailgun reported no result";
    const carried = signed.length > 0 ? `signed by ${signed.slice(0, 5).join(", ")}` : "no DKIM signature on the message";
    const fromDomainForSoft = input.fromEmail.split("@")[1]?.toLowerCase();
    const sawBank = gmailSawBankSignature(input.rawHeaders, input.fromEmail);
    const noVerdict = !input.dkimResult?.trim();
    const aligned = Boolean(fromDomainForSoft) && signed.some((d) => domainAligned(d, fromDomainForSoft as string));
    return { ok: false, reason: `its signature check did not pass (${reported}; ${carried})`, gmailSawBankSignature: sawBank, soft: noVerdict && aligned && sawBank };
  }
  const fromDomain = input.fromEmail.split("@")[1]?.toLowerCase();
  if (!fromDomain) return { ok: false, reason: "it has no sender address" };
  if (!signed.some((d) => domainAligned(d, fromDomain))) return { ok: false, reason: `no signature belongs to ${fromDomain}`, gmailSawBankSignature: gmailSawBankSignature(input.rawHeaders, input.fromEmail) };
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
