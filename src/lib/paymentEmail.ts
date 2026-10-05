import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { approveZellePayment } from "@/lib/payments";

/**
 * Settles payments from the "you received money" emails the owner's Gmail
 * forwards in. A payment is only ever approved here when an email's amount
 * and sender name match exactly one open payment, so money really arrived.
 * Anything unclear is left for the normal admin queue.
 */

// Only emails from these senders are read. The Gmail script filters the same
// way, this is the second check.
const ALLOWED_SENDER_DOMAINS = ["bankofamerica.com", "venmo.com", "sofi.com"];

const RECEIPT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export interface ParsedPaymentEmail {
  method: PaymentMethod;
  name: string;
  amountCents: number;
  memo: string | null;
}

function toCents(raw: string): number | null {
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function isAllowedSender(from: string): boolean {
  const match = from.toLowerCase().match(/@([a-z0-9.-]+)>?\s*$/);
  if (!match) return false;
  const domain = match[1];
  return ALLOWED_SENDER_DOMAINS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

/** Reads the payer, amount and memo out of a Zelle or Venmo "you received money" email. */
export function parsePaymentEmail(subject: string, body: string): ParsedPaymentEmail | null {
  const cleanSubject = subject.replace(/Zelle®?/gi, "").replace(/\s+/g, " ").trim();
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Bank alerts: "Jordan Alemu sent you $25.00"
  let match = cleanSubject.match(/^(.+?) sent you \$([\d,]+(?:\.\d{2})?)/i);
  if (match) {
    const amountCents = toCents(match[2]);
    if (!amountCents) return null;
    // The memo is the line right after the repeated headline in the body.
    const headline = lines.findIndex((line) => /sent you \$/i.test(line));
    const memo = headline >= 0 && lines[headline + 1] && !/^view your balance/i.test(lines[headline + 1]) ? lines[headline + 1] : null;
    return { method: "ZELLE", name: match[1].trim(), amountCents, memo };
  }

  // Other banks: "You received $25.00 from Jordan Alemu"
  match = cleanSubject.match(/you(?:'ve| have)? received \$([\d,]+(?:\.\d{2})?) (?:with|via)? ?(?:from )?(.+)$/i);
  if (match) {
    const amountCents = toCents(match[1]);
    if (!amountCents) return null;
    return { method: "ZELLE", name: match[2].replace(/^from /i, "").trim(), amountCents, memo: null };
  }

  // Venmo: "Jordan Alemu paid you $25.00"
  match = cleanSubject.match(/^(.+?) paid you \$([\d,]+(?:\.\d{2})?)/i);
  if (match) {
    const amountCents = toCents(match[2]);
    if (!amountCents) return null;
    const noteLine = lines.find((line) => /\(Bass Note Piano\)/i.test(line)) ?? null;
    return { method: "VENMO", name: match[1].trim(), amountCents, memo: noteLine };
  }

  return null;
}

function nameTokens(value: string | null | undefined): string[] {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/** True when every word of the shorter name appears in the longer one (so "Jordan Alemu" matches "Jordan T Alemu"). */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const first = nameTokens(a);
  const second = nameTokens(b);
  if (first.length < 2 || second.length < 2) return false;
  const [short, long] = first.length <= second.length ? [first, second] : [second, first];
  return short.every((token) => long.includes(token));
}

type OpenPayment = {
  id: string;
  status: "AWAITING_TRANSFER" | "PENDING_REVIEW";
  amountCents: number;
  senderName: string | null;
  user: { name: string | null };
};

function paymentMatchesReceipt(payment: OpenPayment, receipt: { senderName: string; amountCents: number }) {
  return (
    payment.amountCents === receipt.amountCents &&
    (namesMatch(payment.senderName, receipt.senderName) || namesMatch(payment.user.name, receipt.senderName))
  );
}

async function approveFromReceipt(paymentId: string, receipt: { id: string; senderName: string; method: PaymentMethod }) {
  // Claim the receipt first so two payments can never settle from one email.
  const claimed = await prisma.processedPaymentEmail.updateMany({
    where: { id: receipt.id, paymentId: null },
    data: { paymentId },
  });
  if (claimed.count !== 1) return false;

  try {
    await prisma.zellePayment.updateMany({
      where: { id: paymentId, status: "AWAITING_TRANSFER" },
      data: {
        status: "PENDING_REVIEW",
        senderName: receipt.senderName,
        method: receipt.method,
        submittedAt: new Date(),
      },
    });
    await approveZellePayment(paymentId, null, { auto: true });
    // The money is confirmed by the email itself, so nothing is left to check.
    await prisma.zellePayment.update({ where: { id: paymentId }, data: { checkedAt: new Date() } });
    return true;
  } catch (err) {
    console.error("Email approval failed, releasing the receipt", err);
    await prisma.processedPaymentEmail.updateMany({ where: { id: receipt.id, paymentId }, data: { paymentId: null } });
    return false;
  }
}

const openPaymentSelect = {
  id: true,
  status: true,
  amountCents: true,
  senderName: true,
  user: { select: { name: true } },
} as const;

export type IngestOutcome = "ignored" | "duplicate" | "approved" | "stored";

/** Handles one forwarded email. Safe to call repeatedly with the same message. */
export async function ingestPaymentEmail(input: {
  messageId: string;
  from: string;
  subject: string;
  body: string;
}): Promise<IngestOutcome> {
  if (!isAllowedSender(input.from)) return "ignored";
  const parsed = parsePaymentEmail(input.subject, input.body);
  if (!parsed) return "ignored";

  let receipt;
  try {
    receipt = await prisma.processedPaymentEmail.create({
      data: {
        messageId: input.messageId.slice(0, 200),
        method: parsed.method,
        senderName: parsed.name.slice(0, 120),
        amountCents: parsed.amountCents,
        memo: parsed.memo?.slice(0, 300) ?? null,
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") return "duplicate";
    throw err;
  }

  const candidates = await prisma.zellePayment.findMany({
    where: { status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] }, amountCents: parsed.amountCents },
    select: openPaymentSelect,
  });
  const matches = candidates.filter((payment) => paymentMatchesReceipt(payment as OpenPayment, receipt));
  if (matches.length === 1 && (await approveFromReceipt(matches[0].id, receipt))) return "approved";
  return "stored";
}

/**
 * Called when a student submits "I've sent it": if the email already arrived
 * (it usually does first), settle straight away.
 */
export async function settleWithStoredReceipt(paymentId: string): Promise<boolean> {
  const payment = await prisma.zellePayment.findUnique({ where: { id: paymentId }, select: openPaymentSelect });
  if (!payment || payment.status !== "PENDING_REVIEW") return false;

  const receipts = await prisma.processedPaymentEmail.findMany({
    where: {
      paymentId: null,
      amountCents: payment.amountCents,
      createdAt: { gte: new Date(Date.now() - RECEIPT_MAX_AGE_MS) },
    },
  });
  const matches = receipts.filter((receipt) => paymentMatchesReceipt(payment as OpenPayment, receipt));
  if (matches.length !== 1) return false;
  return approveFromReceipt(payment.id, matches[0]);
}
