import { prisma } from "@/lib/prisma";
import { approveZellePayment } from "@/lib/payments";

/**
 * A bill of $0 (a 100% scholarship on the 6 Month plan) has nothing to pay, so it settles by itself: it goes straight to review with
 * a note and is approved the same moment, through the ordinary approval (credits, the plan's progress, its weekly classes, the
 * first-payment effects). The approval's own bell notice says "Covered by your scholarship" for a $0 bill, so there is one notice per
 * bill. `quiet` skips that notice too, for a caller that tells the student itself (the owner's "Set up plan").
 * Safe to call twice: only one call wins the status change. Returns true when this call settled it.
 */
export async function settleFreeBill(paymentId: string, opts: { quiet?: boolean } = {}): Promise<boolean> {
  const now = new Date();
  const moved = await prisma.zellePayment.updateMany({
    where: { id: paymentId, amountCents: 0, purpose: "PAYMENT_PLAN_INSTALLMENT", status: "AWAITING_TRANSFER" },
    data: { status: "PENDING_REVIEW", submittedAt: now, checkedAt: now, zelleHandle: "Covered by scholarship" },
  });
  if (moved.count === 0) return false;
  await approveZellePayment(paymentId, null, { auto: true, skipReceipt: true, skipStudentNotice: opts.quiet });
  return true;
}

/** Settles every open $0 plan bill an account has (after a scholarship that makes the plan free is claimed). */
export async function settleFreeBillsFor(userId: string): Promise<number> {
  const open = await prisma.zellePayment.findMany({ where: { userId, amountCents: 0, purpose: "PAYMENT_PLAN_INSTALLMENT", status: "AWAITING_TRANSFER" }, select: { id: true } });
  let settled = 0;
  for (const bill of open) if (await settleFreeBill(bill.id)) settled++;
  return settled;
}
