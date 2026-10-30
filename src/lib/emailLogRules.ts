import { createHmac, timingSafeEqual } from "crypto";
import type { EmailStatus } from "@prisma/client";

/**
 * Pure rules for the email record (EmailLog): which status an email ends up in as Resend's events arrive, the plain label for each,
 * and the check that a webhook call really came from Resend (Resend signs its webhooks the Svix way: an HMAC-SHA256 of
 * "<id>.<timestamp>.<body>" with the endpoint's secret, sent as "v1,<base64>").
 */

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  SENT: "Sent",
  SKIPPED: "Not sent",
  FAILED: "Failed to send",
  DELAYED: "Delayed",
  DELIVERED: "Delivered",
  OPENED: "Opened",
  CLICKED: "Opened a link",
  BOUNCED: "Bounced",
  COMPLAINED: "Marked as spam",
};

/** Good news moves forward only (a late "delivered" never undoes "opened"); a bounce or a spam report always wins and then stays. */
const RANK: Partial<Record<EmailStatus, number>> = { SENT: 1, DELAYED: 2, DELIVERED: 3, OPENED: 4, CLICKED: 5 };

export function nextEmailStatus(current: EmailStatus, event: EmailStatus): EmailStatus {
  if (current === "BOUNCED" || current === "COMPLAINED") return current;
  if (event === "BOUNCED" || event === "COMPLAINED") return event;
  return (RANK[event] ?? 0) > (RANK[current] ?? 0) ? event : current;
}

export function statusFromResendEvent(type: string): EmailStatus | null {
  switch (type) {
    case "email.sent":
      return "SENT";
    case "email.delivery_delayed":
      return "DELAYED";
    case "email.delivered":
      return "DELIVERED";
    case "email.opened":
      return "OPENED";
    case "email.clicked":
      return "CLICKED";
    case "email.bounced":
      return "BOUNCED";
    case "email.complained":
      return "COMPLAINED";
    default:
      return null;
  }
}

/** Five minutes either way, so an old captured request cannot be replayed. */
const TOLERANCE_SECONDS = 5 * 60;

export function verifyResendSignature(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${body}`).digest();
  return headers.signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
