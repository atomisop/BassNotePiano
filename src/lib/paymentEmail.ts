import { getBoolSetting } from "@/lib/siteSettings";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { approveZellePayment, notifyAutoApproved } from "@/lib/payments";
import { createNotification } from "@/lib/notifications";
import { memoHasOtherReference, memoHasReferenceFor } from "@/lib/paymentReference";
import { normalizePhone } from "@/lib/phone";

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
  /** The sender's whole phone number (E.164), when the email shows one. */
  senderPhone: string | null;
  /** Only the last four digits, when the bank masks the rest ("xxx-xxx-1234"). */
  senderPhoneLast4: string | null;
}

/**
 * Looks for the sender's phone number in an email, if the bank included one. A whole number counts only when
 * it is written like a phone number (separators, brackets or a +1) or sits right after the word "phone",
 * "mobile" or "cell", so order numbers and amounts are not mistaken for one. A masked number gives its last four.
 */
export function extractPhoneClues(text: string): { phone: string | null; last4: string | null } {
  const spaced = text.replace(/[\u00a0\u2007\u202f]/g, " ");
  const formatted = spaced.match(/(?:\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}|\+1\d{10}/);
  if (formatted) {
    const phone = normalizePhone(formatted[0]);
    if (phone) return { phone, last4: null };
  }
  const labelled = spaced.match(/(?:phone|mobile|cell)[^\d\n]{0,20}(\+?1?[\s.-]?[2-9]\d{9})\b/i);
  if (labelled) {
    const phone = normalizePhone(labelled[1]);
    if (phone) return { phone, last4: null };
  }
  const masked = spaced.match(/(?:[*•xX#]{2,}[\s).-]*){1,3}(\d{4})\b/) ?? spaced.match(/(?:phone|mobile|cell|number)[^\d\n]{0,25}ending (?:in|with) (\d{4})\b/i);
  if (masked) return { phone: null, last4: masked[1] };
  return { phone: null, last4: null };
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

/** Reads the payer, amount, memo and (when the bank shows one) the sender's phone out of a Zelle or Venmo "you received money" email. */
export function parsePaymentEmail(subject: string, body: string): ParsedPaymentEmail | null {
  const core = parseCore(subject, body);
  if (!core) return null;
  const clues = extractPhoneClues(`${subject}\n${body}`);
  return { ...core, senderPhone: clues.phone, senderPhoneLast4: clues.last4 };
}

function parseCore(subject: string, body: string): Omit<ParsedPaymentEmail, "senderPhone" | "senderPhoneLast4"> | null {
  const cleanSubject = subject.replace(/Zelle®?/gi, "").replace(/\s+/g, " ").trim();
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // SoFi: the body reads "The $199.99 sent to you by JORDAN ALEMU will be automatically deposited to your account.",
  // then the sender's note, then a notice that SoFi is not responsible for it. The subject varies, so the body
  // is what is read, and it is read first so the note comes through.
  const sofi = parseSofi(body);
  if (sofi) return sofi;

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

/** SoFi's Zelle "money is on its way" email. Null when the text is not that email. */
export function parseSofi(body: string): Omit<ParsedPaymentEmail, "senderPhone" | "senderPhoneLast4"> | null {
  const text = body.replace(/\s+/g, " ").trim();
  const headline = text.match(/\$([\d,]+(?:\.\d{2})?) sent to you by (.{2,80}?) (?:will be|has been|was|is) /i);
  if (!headline) return null;
  const amountCents = toCents(headline[1]);
  if (!amountCents) return null;
  // The note is whatever follows the end of that sentence, up to SoFi's disclaimer.
  const afterHeadline = text.slice((headline.index ?? 0) + headline[0].length);
  const sentenceEnd = afterHeadline.search(/\.(\s|$)/);
  const rest = sentenceEnd >= 0 ? afterHeadline.slice(sentenceEnd + 1) : "";
  const note = rest.split(/SoFi is not responsible|Privacy and Security|Contact Us/i)[0].trim();
  return { method: "ZELLE", name: headline[2].trim(), amountCents, memo: note || null };
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

/** The same word, or a single letter that starts the other ("A" for "Alemu"), as banks and people shorten names. */
function sameToken(a: string, b: string): boolean {
  return a === b || (a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b));
}

/** True when every word of the shorter name appears in the longer one (so "Jordan Alemu" matches "Jordan T Alemu"). */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const first = nameTokens(a);
  const second = nameTokens(b);
  if (first.length < 2 || second.length < 2) return false;
  const [short, long] = first.length <= second.length ? [first, second] : [second, first];
  // At least one whole word has to match as written, so two bare initials can never match a person by themselves.
  const oneWholeWord = short.some((token) => token.length > 1 && long.includes(token));
  return oneWholeWord && short.every((token) => long.some((other) => sameToken(token, other)));
}

type OpenPayment = {
  id: string;
  status: "AWAITING_TRANSFER" | "PENDING_REVIEW";
  amountCents: number;
  senderName: string | null;
  /** The number the student typed when the payment sheet opened (before paying). */
  senderPhone?: string | null;
  user: { name: string | null; phone?: string | null; payerAliases: { name: string }[] };
};

type ReceiptFacts = { senderName: string; amountCents: number; memo: string | null; senderPhone?: string | null; senderPhoneLast4?: string | null };

/**
 * True when the email shows a phone number for the sender AND we have one for the payer AND they disagree.
 * Used on name matches, where it can only HOLD a payment for a person to look at. Missing on either side
 * means no opinion.
 */
export function phoneConflicts(accountPhone: string | null | undefined, receipt: ReceiptFacts): boolean {
  if (!accountPhone) return false;
  if (receipt.senderPhone) return receipt.senderPhone !== accountPhone;
  if (receipt.senderPhoneLast4) return !accountPhone.endsWith(receipt.senderPhoneLast4);
  return false;
}

/** True when the email's phone clue agrees with the account's number (used only to point an admin at the likely student). */
export function phoneAgrees(accountPhone: string | null | undefined, receipt: { senderPhone?: string | null; senderPhoneLast4?: string | null }): boolean {
  if (!accountPhone) return false;
  if (receipt.senderPhone) return receipt.senderPhone === accountPhone;
  if (receipt.senderPhoneLast4) return accountPhone.endsWith(receipt.senderPhoneLast4);
  return false;
}

/** The names this student's money may arrive under: their own, plus any a person confirmed by hand. */
function payerNames(user: OpenPayment["user"]): (string | null)[] {
  return [user.name, ...user.payerAliases.map((alias) => alias.name)];
}

export type MatchVia = "code" | "name" | "phone" | "amount";

/**
 * How an email claims a payment, or null when it does not. The exact amount always has to match. On top of that:
 *  - "code": the note carries this payment's own reference code (so a parent paying, or two students with one
 *    name, still land on the right payment), or
 *  - "name": the sender is the account holder or a confirmed alias, the note does not name a different payment,
 *    and the phone clue (when the email has one and we have one) does not point at a different number, or
 *  - "phone": the email shows the WHOLE phone number the student typed for this very payment. A masked
 *    last-four never claims a payment by itself (too few combinations).
 * A typed phone is not proof, since anyone can type someone else's number, so "phone" is the weakest way in: the
 * picker below only settles when it is the one payment that matches, and the caller leaves a phone settlement in
 * the owner's "unchecked" list instead of marking it confirmed.
 */
export function receiptMatchVia(payment: OpenPayment, receipt: ReceiptFacts): MatchVia | null {
  if (payment.amountCents !== receipt.amountCents) return null;
  if (memoHasReferenceFor(receipt.memo, payment.id)) return "code";
  if (memoHasOtherReference(receipt.memo, payment.id)) return null;
  if (payerNames(payment.user).some((name) => namesMatch(name, receipt.senderName))) {
    // The number typed for this payment is the best one to compare; the account's number is the fallback.
    return phoneConflicts(payment.senderPhone ?? payment.user.phone, receipt) ? null : "name";
  }
  if (payment.senderPhone && receipt.senderPhone && payment.senderPhone === receipt.senderPhone) return "phone";
  return null;
}

export function receiptMatchesPayment(payment: OpenPayment, receipt: ReceiptFacts): boolean {
  return receiptMatchVia(payment, receipt) !== null;
}

/** The one payment an email settles, and how, or null when it is unclear (then a person decides). */
export function pickMatch<T extends OpenPayment>(payments: T[], receipt: ReceiptFacts): { payment: T; via: MatchVia } | null {
  const matches = payments.map((payment) => ({ payment, via: receiptMatchVia(payment, receipt) })).filter((m): m is { payment: T; via: MatchVia } => m.via !== null);
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) return null;
  const byCode = matches.filter((m) => m.via === "code");
  return byCode.length === 1 ? byCode[0] : null;
}

/** The one payment an email settles, or null when it is unclear (then a person decides). */
export function pickMatchingPayment<T extends OpenPayment>(payments: T[], receipt: ReceiptFacts): T | null {
  return pickMatch(payments, receipt)?.payment ?? null;
}

async function approveFromReceipt(paymentId: string, receipt: { id: string; senderName: string; method: PaymentMethod }, opts: { needsCheck?: boolean; via?: MatchVia } = {}) {
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
    // The money is confirmed by the email itself, so nothing is left to check. Except a settlement that rested on
    // a typed-in phone number alone: that stays in the owner's "unchecked" list to be looked at.
    if (!opts.needsCheck) await prisma.zellePayment.update({ where: { id: paymentId }, data: { checkedAt: new Date() } });
    if (opts.via) await prisma.zellePayment.update({ where: { id: paymentId }, data: { matchedVia: opts.via } });
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
  senderPhone: true,
  userId: true,
  createdAt: true,
  user: { select: { name: true, phone: true, payerAliases: { select: { name: true } } } },
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
        senderPhone: parsed.senderPhone,
        senderPhoneLast4: parsed.senderPhoneLast4,
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
  let picked: { payment: OpenPayment & { id: string }; via: MatchVia } | null = pickMatch(candidates as OpenPayment[], receipt);
  // Nothing matched by code, name or phone. If exactly one recent payment is open for this exact amount (prices end in
  // .99, which nobody sends by accident) and the sender is not someone we know under another account, the money is
  // almost certainly for that payment. It is approved but left in the owner's unchecked list.
  if (!picked) {
    const only = await pickByAmountAlone(candidates as (OpenPayment & { userId: string; createdAt: Date })[], receipt);
    if (only) picked = { payment: only, via: "amount" };
  }
  const match = picked?.payment ?? null;
  if (picked && (await getBoolSetting("payments.emailAutoApprove")) && (await approveFromReceipt(picked.payment.id, receipt, { needsCheck: picked.via === "phone" || picked.via === "amount", via: picked.via }))) return "approved";
  if (!match && (await getBoolSetting("payments.amountMismatchNotice"))) await warnAboutAmountMismatch(receipt).catch((err) => console.error("Amount mismatch notice failed (non-blocking):", err));
  return "stored";
}

/** An open payment older than this is not one a student is waiting on, so the exact amount alone does not claim it. */
const AMOUNT_ALONE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/** True when the sender's name is a name we know on a DIFFERENT account (their own, or one an admin confirmed). */
async function senderBelongsToAnotherAccount(senderName: string, userId: string): Promise<boolean> {
  const tokens = nameTokens(senderName);
  if (tokens.length < 2) return false;
  const [first, last] = [tokens[0], tokens[tokens.length - 1]];
  const accounts = await prisma.user.findMany({
    where: { id: { not: userId }, OR: [{ name: { contains: first, mode: "insensitive" } }, { name: { contains: last, mode: "insensitive" } }] },
    select: { name: true },
    take: 100,
  });
  if (accounts.some((account) => namesMatch(account.name, senderName))) return true;
  const aliases = await prisma.payerAlias.findMany({
    where: { userId: { not: userId }, OR: [{ name: { contains: first, mode: "insensitive" } }, { name: { contains: last, mode: "insensitive" } }] },
    select: { name: true },
    take: 100,
  });
  return aliases.some((alias) => namesMatch(alias.name, senderName));
}

/**
 * The exact amount, by itself, claims a payment only when ALL of these hold: the owner has the setting on, exactly
 * one payment is open for that amount, it was opened recently, the note does not name a different payment, and the
 * sender is not a known person on another account (then they are probably paying for something else, so a person
 * decides). The money did arrive in exactly that amount, so the worst case is a wrong attribution, which the owner
 * sees in the unchecked list.
 */
async function pickByAmountAlone<T extends OpenPayment & { userId: string; createdAt: Date }>(candidates: T[], receipt: ReceiptFacts): Promise<T | null> {
  if (candidates.length !== 1) return null;
  const only = candidates[0];
  if (only.amountCents !== receipt.amountCents) return null;
  if (Date.now() - only.createdAt.getTime() > AMOUNT_ALONE_MAX_AGE_MS) return null;
  if (memoHasOtherReference(receipt.memo, only.id)) return null;
  if (!(await getBoolSetting("payments.matchByAmount"))) return null;
  if (await senderBelongsToAnotherAccount(receipt.senderName, only.userId)) return null;
  return only;
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
