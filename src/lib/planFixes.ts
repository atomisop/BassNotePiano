import { prisma } from "@/lib/prisma";
import { PaymentPlanError } from "@/lib/paymentPlans";

/**
 * A plan tool that refuses because of something the owner can fix right there says what that is, so the same dialog shows the fix
 * (a payment to approve, reject or mark paid, a running plan to cancel, a first payment to record) instead of sending them to another
 * screen. The tool still refuses; the dialog offers the fix, and the owner tries again.
 */
export type PlanFix =
  | { kind: "payment"; paymentId: string }
  | { kind: "cancel-plan"; planId: string }
  | { kind: "record-payment"; planId: string };

/** What a refusal knows. A group that has not started is turned into its combined first payment when the fix is read. */
export type PlanFixRef = PlanFix | { kind: "group-start"; groupId: string };

export class PlanFixError extends PaymentPlanError {
  fix: PlanFixRef;
  constructor(message: string, fix: PlanFixRef) {
    super(message);
    this.name = "PlanFixError";
    this.fix = fix;
  }
}

/** The fix a refusal carries, ready for the screen: a bill held in a group's combined bill points at the combined bill. Null when there is none. */
export async function resolvePlanFix(err: unknown): Promise<PlanFix | null> {
  if (!(err instanceof PlanFixError)) return null;
  const fix = err.fix;
  if (fix.kind === "group-start") {
    const start = await prisma.zellePayment.findFirst({
      where: { familyGroupId: fix.groupId, purpose: "FAMILY_PLAN_START", status: { in: ["PENDING_REVIEW", "AWAITING_TRANSFER"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return start ? { kind: "payment", paymentId: start.id } : null;
  }
  if (fix.kind === "payment") {
    const row = await prisma.zellePayment.findUnique({ where: { id: fix.paymentId }, select: { id: true, bundleId: true } });
    if (!row) return null;
    return { kind: "payment", paymentId: row.bundleId ?? row.id };
  }
  return fix;
}

/** The payment on this plan that is waiting for review, as a refusal the dialog can fix in place. */
export async function refuseWhileInReview(planId: string, message = "A payment for this plan is waiting for review. Approve or reject it below, then try again."): Promise<void> {
  const inReview = await prisma.zellePayment.findFirst({ where: { paymentPlanId: planId, status: "PENDING_REVIEW" }, select: { id: true } });
  if (inReview) throw new PlanFixError(message, { kind: "payment", paymentId: inReview.id });
}

/**
 * A group member's money goes through the group: before the group starts, its combined first payment starts every plan at once; after,
 * an open bill held inside the combined bill is paid with it. Recording a payment on the member's plan alone would pay one person only.
 */
export async function refuseIfPaidThroughGroup(planId: string): Promise<void> {
  const plan = await prisma.paymentPlan.findUnique({ where: { id: planId }, select: { familyGroupId: true, installmentsPaid: true } });
  if (plan?.familyGroupId && plan.installmentsPaid < 1) throw groupNotStartedError(plan.familyGroupId);
  const held = await prisma.zellePayment.findFirst({ where: { paymentPlanId: planId, status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] }, bundleId: { not: null } }, select: { bundleId: true } });
  if (held?.bundleId) throw new PlanFixError("This bill is part of the group's combined bill, which the payer pays for everyone. Mark that one paid below.", { kind: "payment", paymentId: held.bundleId });
}

/** A group or parent plan whose combined first payment is not approved yet: nothing on one person's plan can change until it is. */
export function groupNotStartedError(groupId: string): PlanFixError {
  return new PlanFixError("This group plan has not started yet. Its combined first payment is below: approve it or mark it paid, then try again.", { kind: "group-start", groupId });
}
