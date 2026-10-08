import { getBoolSetting } from "@/lib/siteSettings";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { approveZellePayment, notifyAutoApproved } from "@/lib/payments";
import { createNotification } from "@/lib/notifications";
import { memoHasOtherReference, memoHasReferenceFor } from "@/lib/paymentReference";

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
/** How far back an open payment still counts as one a student is waiting on. */
const OPEN_PAYMENT_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

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
  user: { name: string | null; payerAliases: { name: string }[] };
};

type ReceiptFacts = { senderName: string; amountCents: number; memo: string | null };

/** The names this student's money may arrive under: their own, plus any a person confirmed by hand. */
function payerNames(user: OpenPayment["user"]): (string | null)[] {
  return [user.name, ...user.payerAliases.map((alias) => alias.name)];
}

/**
 * The exact amount always has to match. On top of that, one of:
 *  - the note carries this payment's own reference code (so a parent paying, or two
 *    students with one name, still land on the right payment), or
 *  - the sender is the account holder or a confirmed alias, and the note does not
 *    name a different payment.
 * The sender name a student types when submitting is theirs to choose, so it is
 * never what claims someone else's money. A mismatch just leaves the payment for the admin.
 */
export function receiptMatchesPayment(payment: OpenPayment, receipt: ReceiptFacts): boolean {
  if (payment.amountCents !== receipt.amountCents) return false;
  if (memoHasReferenceFor(receipt.memo, payment.id)) return true;
  if (memoHasOtherReference(receipt.memo, payment.id)) return false;
  return payerNames(payment.user).some((name) => namesMatch(name, receipt.senderName));
}

/** The one payment an email settles, or null when it is unclear (then a person decides). */
export function pickMatchingPayment<T extends OpenPayment>(payments: T[], receipt: ReceiptFacts): T | null {
  const matches = payments.filter((payment) => receiptMatchesPayment(payment, receipt));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) return null;
  const byCode = matches.filter((payment) => memoHasReferenceFor(receipt.memo, payment.id));
  return byCode.length === 1 ? byCode[0] : null;
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
    await notifyAutoApproved(paymentId);
    return true;
  } catch (err) {
    console.error("Email approval step failed", err);
    // Only give the receipt back if the payment was NOT approved: once it is VERIFIED the
    // receipt is spent, and releasing it could approve a second payment with the same email.
    const state = await prisma.zellePayment.findUnique({ where: { id: paymentId }, select: { status: true } });
    if (state?.status !== "VERIFIED") {
      await prisma.processedPaymentEmail.updateMany({ where: { id: receipt.id, paymentId }, data: { paymentId: null } });
      return false;
    }
    return true;
  }
}

const openPaymentSelect = {
  id: true,
  status: true,
  amountCents: true,
  senderName: true,
  user: { select: { name: true, payerAliases: { select: { name: true } } } },
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
  const match = pickMatchingPayment(candidates as OpenPayment[], receipt);
  if (match && (await getBoolSetting("payments.emailAutoApprove")) && (await approveFromReceipt(match.id, receipt))) return "approved";
  if (!match && (await getBoolSetting("payments.amountMismatchNotice"))) await warnAboutAmountMismatch(receipt).catch((err) => console.error("Amount mismatch notice failed (non-blocking):", err));
  return "stored";
}

/**
 * The money came from a name that has an open payment, but for a different amount.
 * Tell that student now, so they do not sit waiting on a payment that can never match.
 * Only when no payment of the exact amount was a candidate at all.
 */
async function warnAboutAmountMismatch(receipt: ReceiptFacts) {
  const sameAmount = await prisma.zellePayment.count({
    where: { status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] }, amountCents: receipt.amountCents },
  });
  if (sameAmount > 0) return;
  const open = await prisma.zellePayment.findMany({
    where: { status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] }, createdAt: { gte: new Date(Date.now() - OPEN_PAYMENT_LOOKBACK_MS) } },
    select: { userId: true, amountCents: true, user: openPaymentSelect.user },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const students = new Map<string, number>();
  for (const payment of open) {
    if (students.has(payment.userId)) continue;
    if (payerNames(payment.user).some((name) => namesMatch(name, receipt.senderName))) students.set(payment.userId, payment.amountCents);
  }
  // Two or more people share this name: it is not clear whose money it is, so say nothing.
  if (students.size !== 1) return;
  const [userId, expectedCents] = Array.from(students.entries())[0];
  await createNotification({
    userId,
    type: "PAYMENT_AMOUNT_MISMATCH",
    title: "We received a different amount",
    body: `We received ${formatUsd(receipt.amountCents)} under your name, but your open payment is for ${formatUsd(expectedCents)}, so it could not clear on its own. A person will look at it. You do not need to send it again. If you meant to pay a different amount, message us.`,
    emailCategory: "payments",
    alwaysEmail: true,
  });
}

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
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
      dismissedAt: null,
      amountCents: payment.amountCents,
      createdAt: { gte: new Date(Date.now() - RECEIPT_MAX_AGE_MS) },
    },
  });
  const matches = receipts.filter((receipt) => receiptMatchesPayment(payment as OpenPayment, receipt));
  // Several emails of the same amount: only the one that carries this payment's own code is certain.
  const certain = matches.length > 1 ? matches.filter((receipt) => memoHasReferenceFor(receipt.memo, payment.id)) : matches;
  if (certain.length !== 1) return false;
  return approveFromReceipt(payment.id, certain[0]);
}
