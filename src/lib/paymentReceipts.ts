import { prisma } from "@/lib/prisma";
import { approveZellePayment } from "@/lib/payments";
import { logAudit } from "@/lib/audit";
import { unmatchedReceiptWhere } from "@/lib/paymentPipelineStatus";

// Bank and Venmo emails that matched no payment, and what an admin can do
// about them: attach one to a payment, or dismiss it. Every function here
// assumes the caller (the admin actions) has checked for an ADMIN session.

export class ReceiptError extends Error {}

export interface UnmatchedReceipt {
  id: string;
  method: "ZELLE" | "VENMO" | string;
  senderName: string;
  amountCents: number;
  memo: string | null;
  receivedAt: Date;
  /** Open payments for exactly the same amount: the only ones this email may be attached to. */
  candidates: { id: string; status: string; studentName: string | null; studentEmail: string; createdAt: Date }[];
}

export async function listUnmatchedReceipts(now = new Date()): Promise<UnmatchedReceipt[]> {
  const receipts = await prisma.processedPaymentEmail.findMany({
    where: unmatchedReceiptWhere(now),
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  if (receipts.length === 0) return [];
  const open = await prisma.zellePayment.findMany({
    where: { status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] }, amountCents: { in: receipts.map((r) => r.amountCents) } },
    select: { id: true, status: true, amountCents: true, createdAt: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  return receipts.map((r) => ({
    id: r.id,
    method: r.method,
    senderName: r.senderName,
    amountCents: r.amountCents,
    memo: r.memo,
    receivedAt: r.createdAt,
    candidates: open
      .filter((p) => p.amountCents === r.amountCents)
      .map((p) => ({ id: p.id, status: p.status, studentName: p.user.name, studentEmail: p.user.email, createdAt: p.createdAt })),
  }));
}

/**
 * Attaches an email to a payment and approves it, as the admin. The amounts
 * must be exactly equal: this is the same money check the automatic matching
 * makes, with a person choosing the student instead of the name matching.
 */
export async function matchReceiptToPayment(input: {
  receiptId: string;
  paymentId: string;
  admin: { id: string; email: string | null };
}): Promise<void> {
  const { receiptId, paymentId, admin } = input;
  const receipt = await prisma.processedPaymentEmail.findUnique({ where: { id: receiptId } });
  if (!receipt || receipt.paymentId || receipt.dismissedAt) throw new ReceiptError("That email has already been handled.");
  const payment = await prisma.zellePayment.findUnique({
    where: { id: paymentId },
    select: { id: true, status: true, amountCents: true },
  });
  if (!payment || (payment.status !== "AWAITING_TRANSFER" && payment.status !== "PENDING_REVIEW")) {
    throw new ReceiptError("That payment is no longer open.");
  }
  if (payment.amountCents !== receipt.amountCents) {
    throw new ReceiptError("The amounts are different, so this email cannot be attached to that payment.");
  }

  // Claim the email first so it can never settle two payments.
  const claimed = await prisma.processedPaymentEmail.updateMany({ where: { id: receipt.id, paymentId: null, dismissedAt: null }, data: { paymentId } });
  if (claimed.count !== 1) throw new ReceiptError("That email has already been handled.");

  try {
    await prisma.zellePayment.updateMany({
      where: { id: paymentId, status: "AWAITING_TRANSFER" },
      data: { status: "PENDING_REVIEW", senderName: receipt.senderName, method: receipt.method, submittedAt: new Date() },
    });
    await approveZellePayment(paymentId, admin.id);
    await prisma.zellePayment.update({ where: { id: paymentId }, data: { checkedAt: new Date() } });
  } catch (err) {
    console.error("Matching a payment email failed", err);
    // Give the email back only if the payment was NOT approved: once it is VERIFIED the email is spent.
    const state = await prisma.zellePayment.findUnique({ where: { id: paymentId }, select: { status: true } });
    if (state?.status !== "VERIFIED") {
      await prisma.processedPaymentEmail.updateMany({ where: { id: receipt.id, paymentId }, data: { paymentId: null } });
      throw new ReceiptError("The payment could not be approved. Nothing was changed.");
    }
  }

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "payment.match_email",
    targetType: "ZellePayment",
    targetId: paymentId,
    detail: `Attached a ${receipt.method} email from ${receipt.senderName} (${(receipt.amountCents / 100).toFixed(2)}) to the payment and approved it`,
  });
}

/** Marks an email as having nothing to do with a payment, so it stops being counted. */
export async function dismissReceipt(input: { receiptId: string; admin: { id: string; email: string | null } }): Promise<void> {
  const { receiptId, admin } = input;
  const updated = await prisma.processedPaymentEmail.updateMany({
    where: { id: receiptId, paymentId: null, dismissedAt: null },
    data: { dismissedAt: new Date() },
  });
  if (updated.count !== 1) return;
  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "payment.dismiss_email",
    targetType: "ProcessedPaymentEmail",
    targetId: receiptId,
    detail: "Dismissed a payment email that matched no payment",
  });
}
