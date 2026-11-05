import { prisma } from "@/lib/prisma";

/**
 * A group's combined first payment (FAMILY_PLAN_START) is only owed while some member's plan is still waiting for its first month.
 * When every member has already been paid for (each paid on their own, or recorded by the studio), nothing is owed any more, but the
 * combined row used to stay "Awaiting transfer" for good. This closes such rows (EXPIRED). It never touches a payment that was
 * submitted or is under review, and never one for a group whose plans are not all started.
 */
export async function expireSettledGroupStarts(): Promise<number> {
  const open = await prisma.zellePayment.findMany({
    where: { purpose: "FAMILY_PLAN_START", status: "AWAITING_TRANSFER", submittedAt: null, familyGroupId: { not: null } },
    select: { id: true, familyGroupId: true },
  });
  let closed = 0;
  for (const row of open) {
    const plans = await prisma.paymentPlan.findMany({ where: { familyGroupId: row.familyGroupId! }, select: { installmentsPaid: true } });
    if (plans.length === 0 || plans.some((p) => p.installmentsPaid === 0)) continue;
    const res = await prisma.zellePayment.updateMany({ where: { id: row.id, status: "AWAITING_TRANSFER", submittedAt: null }, data: { status: "EXPIRED" } });
    closed += res.count;
  }
  return closed;
}
