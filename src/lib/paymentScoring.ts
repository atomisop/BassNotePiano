import { namesMatch, nameTokens } from "@/lib/personNames";
import { codesOneTypoApart, memoHasOtherReference, memoHasReferenceFor, normalizedCodeOf, referenceInMemo } from "@/lib/paymentReference";

/**
 * Ranks the open payments an unmatched bank email could belong to, and says WHY in plain words, so the owner sees the likely one first and
 * approves it with one tap instead of hunting. This never approves anything by itself: it only orders and explains. (The automatic
 * matching rules in paymentEmail.ts are unchanged and stay the only thing that settles a payment without a person.)
 *
 * Every signal is independent, so one that is missing (no note, a parent paying under a different name) does not sink the others.
 */
export interface ScorablePayment {
  id: string;
  status: string;
  createdAt: Date;
  submittedAt?: Date | null;
  senderPhone?: string | null;
  /** The account holder, then any saved aliases, then (for a family or parent-paid bill) the payer. */
  payerNames: (string | null)[];
  phone?: string | null;
}

export interface ScorableReceipt {
  senderName: string;
  memo: string | null;
  receivedAt: Date;
  senderPhoneLast4?: string | null;
}

export interface Scored {
  score: number;
  reasons: string[];
}

const DAY_MS = 86_400_000;

export function scorePayment(payment: ScorablePayment, receipt: ScorableReceipt): Scored {
  let score = 0;
  const reasons: string[] = [];

  if (memoHasReferenceFor(receipt.memo, payment.id)) {
    score += 60;
    reasons.push("The note has this payment's code");
  } else {
    const typed = referenceInMemo(receipt.memo);
    if (typed && codesOneTypoApart(typed, normalizedCodeOf(payment.id))) {
      score += 40;
      reasons.push("The note has this payment's code with one typo");
    } else if (memoHasOtherReference(receipt.memo, payment.id)) {
      score -= 50;
      reasons.push("The note has a different payment's code");
    }
  }

  if (payment.payerNames.some((name) => namesMatch(name, receipt.senderName))) {
    score += 30;
    reasons.push("The sender's name matches");
  } else {
    const sender = new Set(nameTokens(receipt.senderName));
    const shared = payment.payerNames.some((name) => nameTokens(name).some((token) => sender.has(token)));
    if (shared) {
      score += 12;
      reasons.push("The sender shares a name");
    }
  }

  const phone = payment.senderPhone ?? payment.phone ?? null;
  if (phone && receipt.senderPhoneLast4 && phone.endsWith(receipt.senderPhoneLast4)) {
    score += 15;
    reasons.push("The phone's last four digits match");
  }

  // Money that arrives soon after the payment was opened, or after the student said they sent it, is more likely theirs.
  const since = receipt.receivedAt.getTime() - (payment.submittedAt ?? payment.createdAt).getTime();
  if (since >= -60_000 && since <= 3 * DAY_MS) {
    score += 10;
    reasons.push(payment.submittedAt ? "Arrived after they said they sent it" : "Arrived soon after the payment was opened");
  } else if (since > 14 * DAY_MS) {
    score -= 10;
    reasons.push("The payment was opened a long time before");
  }
  if (payment.status === "PENDING_REVIEW") score += 8;

  return { score, reasons };
}

export type Confidence = "strong" | "likely" | "weak";

/** Scores every candidate, best first. `confidence` is about the TOP one: strong needs a clear lead over the next. */
export function rankPayments<T extends ScorablePayment>(payments: T[], receipt: ScorableReceipt): { ranked: (T & Scored)[]; confidence: Confidence } {
  const ranked = payments.map((p) => ({ ...p, ...scorePayment(p, receipt) })).sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const second = ranked[1];
  const confidence: Confidence = !top ? "weak" : top.score >= 60 && (!second || top.score - second.score >= 25) ? "strong" : top.score >= 30 ? "likely" : "weak";
  return { ranked, confidence };
}
