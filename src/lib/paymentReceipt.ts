// Payment receipts: the facts of one approved payment, read once and drawn twice (the email sent on approval and the printable
// page at /billing/receipt/[paymentId]). The wording lives in paymentReceiptRules.ts.

import { prisma } from "@/lib/prisma";
import { paymentReferenceCode } from "@/lib/paymentReference";
import { sendPaymentReceiptEmail } from "@/lib/email";
import { buildReceipt, type Receipt, type ReceiptFacts } from "@/lib/paymentReceiptRules";

/** A grant made this close to the approval belongs to it. */
const GRANT_WINDOW_MS = 10 * 60_000;

export interface LoadedReceipt {
  receipt: Receipt;
  userId: string;
  email: string;
  banned: boolean;
}

/** The receipt for a VERIFIED payment, or null for any other payment (a receipt is only ever for money that was confirmed). */
export async function loadPaymentReceipt(paymentId: string): Promise<LoadedReceipt | null> {
  const payment = await prisma.zellePayment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      status: true,
      purpose: true,
      method: true,
      amountCents: true,
      reviewedAt: true,
      updatedAt: true,
      senderName: true,
      lessonQuantity: true,
      installmentNumber: true,
      familyGroupId: true,
      extraSessionScheduledAt: true,
      paymentPlanId: true,
      user: { select: { id: true, name: true, email: true, bannedAt: true } },
      paymentPlan: { select: { cadence: true, term: true, termMonths: true, status: true, nextDueDate: true, installmentAmountCents: true } },
    },
  });
  if (!payment || payment.status !== "VERIFIED") return null;
  const paidAt = payment.reviewedAt ?? payment.updatedAt;

  const [grant, groupSize] = await Promise.all([
    payment.paymentPlanId
      ? prisma.creditGrant.findFirst({
          where: { paymentPlanId: payment.paymentPlanId, grantedAt: { gte: new Date(paidAt.getTime() - GRANT_WINDOW_MS), lte: new Date(paidAt.getTime() + GRANT_WINDOW_MS) } },
          orderBy: { grantedAt: "desc" },
          select: { expiresAt: true },
        })
      : null,
    payment.familyGroupId ? prisma.paymentPlan.count({ where: { familyGroupId: payment.familyGroupId } }) : Promise.resolve(null),
  ]);

  const plan = payment.paymentPlan;
  const facts: ReceiptFacts = {
    referenceCode: paymentReferenceCode(payment.id),
    purpose: payment.purpose,
    method: payment.method,
    amountCents: payment.amountCents,
    paidAt,
    accountName: payment.user.name ?? payment.user.email,
    accountEmail: payment.user.email,
    senderName: payment.senderName,
    creditsStored: payment.lessonQuantity,
    plan: plan ? { cadence: plan.cadence, term: plan.term, termMonths: plan.termMonths, installmentNumber: payment.installmentNumber } : null,
    periodEnd: grant?.expiresAt ?? null,
    nextBill: plan && plan.status === "ACTIVE" ? { dueDate: plan.nextDueDate, amountCents: plan.installmentAmountCents } : null,
    groupSize,
    extraClassAt: payment.extraSessionScheduledAt,
  };
  return { receipt: buildReceipt(facts), userId: payment.user.id, email: payment.user.email, banned: Boolean(payment.user.bannedAt) };
}

/**
 * Emails the receipt for an approved payment. A receipt is a record of money the person paid, so it goes out whatever their email
 * switches say (the same exception the old "Payment approved" email had); a banned account is sent nothing.
 */
export async function sendPaymentReceipt(paymentId: string, note?: string): Promise<void> {
  const loaded = await loadPaymentReceipt(paymentId);
  if (!loaded || loaded.banned) return;
  await sendPaymentReceiptEmail(loaded.email, loaded.receipt, { paymentId, note });
}
