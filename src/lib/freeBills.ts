import { prisma } from "@/lib/prisma";
import { approveZellePayment } from "@/lib/payments";
import { createNotification } from "@/lib/notifications";

/**
 * A bill of $0 (a 100% scholarship on the 6 Month plan) has nothing to pay, so it settles by itself: it goes straight to review with
 * a note and is approved the same moment, through the ordinary approval (credits, the plan's progress, its weekly classes, the
 * first-payment effects). Safe to call twice: only one call wins the status change. Returns true when this call settled it.
 */
export async function settleFreeBill(paymentId: string): Promise<boolean> {
  const now = new Date();
  const moved = await prisma.zellePayment.updateMany({
    where: { id: paymentId, amountCents: 0, purpose: "PAYMENT_PLAN_INSTALLMENT", status: "AWAITING_TRANSFER" },
    data: { status: "PENDING_REVIEW", submittedAt: now, checkedAt: now, zelleHandle: "Covered by scholarship" },
  });
  if (moved.count === 0) return false;
  await approveZellePayment(paymentId, null, { auto: true, skipReceipt: true });
  const bill = await prisma.zellePayment.findUnique({ where: { id: paymentId }, select: { userId: true, installmentNumber: true } });
  if (bill) {
    await createNotification({
      userId: bill.userId,
      type: "PAYMENT_APPROVED",
      title: "Covered by your scholarship",
      body: `Your scholarship covers this bill${bill.installmentNumber ? ` (payment ${bill.installmentNumber})` : ""}. Nothing to pay.`,
    }).catch(() => undefined);
  }
  return true;
}

/** Settles every open $0 plan bill an account has (after a scholarship that makes the plan free is claimed). */
export async function settleFreeBillsFor(userId: string): Promise<number> {
  const open = await prisma.zellePayment.findMany({ where: { userId, amountCents: 0, purpose: "PAYMENT_PLAN_INSTALLMENT", status: "AWAITING_TRANSFER" }, select: { id: true } });
  let settled = 0;
  for (const bill of open) if (await settleFreeBill(bill.id)) settled++;
  return settled;
}
