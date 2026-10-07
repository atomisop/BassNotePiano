import { createHmac, timingSafeEqual } from "crypto";

// Pure helpers for email that arrives at music@bassnotepiano.com through a
// Mailgun route and lands in Support Chat's Email tab (see
// src/app/api/inbound/mailgun/route.ts and ingestInboundEmail in support.ts).
// Nothing here touches the database, so all of it is unit tested.

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Mailgun signs every route delivery: HMAC-SHA256 of `timestamp + token` with
 * the account's HTTP webhook signing key, hex encoded. A timestamp more than
 * five minutes off is refused so a captured request cannot be replayed later.
 */
export function verifyMailgunSignature(input: {
  signingKey: string;
  timestamp: string;
  token: string;
  signature: string;
  nowMs?: number;
}): boolean {
  const { signingKey, timestamp, token, signature, nowMs = Date.now() } = input;
  if (!signingKey || !timestamp || !token || !signature) return false;
  const sentAtMs = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAtMs) || Math.abs(nowMs - sentAtMs) > SIGNATURE_MAX_AGE_MS) return false;
  const expected = createHmac("sha256", signingKey).update(timestamp + token).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `"Jane Doe" <jane@example.com>`, `Jane <jane@example.com>` or a bare address. Null when there is no usable address. */
export function parseSender(from: string): { email: string; name: string | null } | null {
  const trimmed = from.trim();
  const angle = trimmed.match(/^(.*?)<([^<>]+)>\s*$/);
  const email = (angle ? angle[2] : trimmed).trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return null;
  const rawName = angle ? angle[1].replace(/^["'\s]+|["'\s]+$/g, "") : "";
  // eslint-disable-next-line no-control-regex
  const name = rawName.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200);
  return { email, name: name || null };
}

/** Mailgun sends `message-headers` as a JSON list of [name, value] pairs. Names are lowercased. */
export function parseMessageHeaders(raw: string | null | undefined): Map<string, string> {
  const headers = new Map<string, string>();
  if (!raw) return headers;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return headers;
    for (const pair of parsed) {
      if (Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string") {
        const name = pair[0].toLowerCase();
        if (!headers.has(name)) headers.set(name, pair[1]);
      }
    }
  } catch {
    // A malformed header blob is treated as no headers.
  }
  return headers;
}

const NOREPLY_LOCAL_PARTS = new Set(["mailer-daemon", "postmaster", "noreply", "no-reply", "donotreply", "do-not-reply"]);
const OWN_DOMAIN = "bassnotepiano.com";

/**
 * Auto-replies, bounces and our own system mail. These never open a thread:
 * answering them can start a loop, and nobody is waiting for a reply.
 */
export function isAutomatedMail(headers: Map<string, string>, senderEmail: string): boolean {
  const autoSubmitted = headers.get("auto-submitted")?.trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  const precedence = headers.get("precedence")?.trim().toLowerCase();
  if (precedence && ["bulk", "junk", "list", "auto_reply"].includes(precedence)) return true;
  if (headers.has("x-autoreply") || headers.has("x-autorespond")) return true;

  const [local, domain] = senderEmail.split("@");
  if (NOREPLY_LOCAL_PARTS.has(local)) return true;
  if (domain === OWN_DOMAIN && local === "music") return true;
  return false;
}

/** Strips any run of leading Re:/Fwd:/Fw:/Aw: and squeezes whitespace, so a reply matches its original's subject. */
export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(\s*(re|fwd?|aw)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Every `<id@host>` token in an In-Reply-To or References value, in order, without repeats. */
export function parseMessageIds(...values: (string | null | undefined)[]): string[] {
  const ids: string[] = [];
  for (const value of values) {
    for (const match of Array.from((value ?? "").matchAll(/<[^<>\s]{1,200}>/g))) {
      if (!ids.includes(match[0])) ids.push(match[0]);
      if (ids.length >= 20) return ids;
    }
  }
  return ids;
}

/** The subject for a reply: one "Re:", never stacked. */
export function replySubject(subject: string | null): string {
  const base = (subject ?? "").trim() || "Your message to Bass Note Piano";
  return /^re\s*:/i.test(base) ? base.slice(0, 200) : `Re: ${base}`.slice(0, 200);
}

/** True when Mailgun's own checks say the sender really owns the domain it claims (DKIM or SPF passed). */
export function isSenderAuthenticated(headers: Map<string, string>): boolean {
  const pass = (value: string | undefined) => value?.trim().toLowerCase() === "pass";
  return pass(headers.get("x-mailgun-dkim-check-result")) || pass(headers.get("x-mailgun-spf"));
}

/** The studio inbox: music@ on the main domain or on any of its subdomains (a forwarded copy arrives at music@inbox.bassnotepiano.com). */
export function isStudioRecipient(recipient: string): boolean {
  return /^music@([a-z0-9-]+\.)*bassnotepiano\.com$/i.test(recipient.trim());
}
