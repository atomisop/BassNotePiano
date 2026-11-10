import { prisma } from "@/lib/prisma";
import { addBillingCycles } from "@/lib/billingCycle";
import { CREDITS_PER_CLASS, formatCredits, storedToCredits } from "@/lib/classCreditPricing";
import { PaymentPlanError, bookReservedWindowForPlan, recordPlanPaymentReceived } from "@/lib/paymentPlans";
import { markAttendance } from "@/lib/classScheduleAdmin";
import { adjustUserCredits } from "@/lib/creditAdjustments";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { groupNotStartedError } from "@/lib/planFixes";

/**
 * A late payer: the student was taught (or is being taught) before paying, then pays after their time has passed. Done by hand
 * this took three screens and arithmetic: record the payment, charge the class already taught, and move the next bill to 28 days
 * from the day they actually paid. This does all of it in one step, and says what it will do first.
 */

export interface LateSettlementPreview {
  planId: string;
  studentName: string;
  amountCents: number;
  /** Stored credits the payment gives (a whole cycle). */
  creditsPerPayment: number;
  currentDueDate: string;
  /** 28 days from now. */
  newDueDate: string;
  /** "open" = an unpaid bill exists and will be marked paid; "new" = a bill is made and marked paid; "done" = a payment was already approved today. */
  payment: "open" | "new" | "done";
  /** Classes already past that nobody has marked yet: the ones that were taught on credit. */
  taught: { id: string; scheduledAt: string; creditsSpent: number }[];
  balance: number;
}

async function loadPlan(planId: string) {
  const plan = await prisma.paymentPlan.findUnique({
    where: { id: planId },
    include: { user: { select: { id: true, name: true, email: true, classCredits: true } }, installmentPayments: { select: { id: true, status: true, reviewedAt: true } } },
  });
  if (!plan) throw new PaymentPlanError("That plan was not found.");
  if (plan.status !== "ACTIVE") throw new PaymentPlanError("Only an active plan can be settled.");
  if (plan.familyGroupId && plan.installmentsPaid < 1) throw groupNotStartedError(plan.familyGroupId);
  return plan;
}

export async function getLateSettlementPreview(planId: string): Promise<LateSettlementPreview> {
  const plan = await loadPlan(planId);
  const todayStart = new Date();
  todayStart.setHours(todayStart.getHours() - 18); // "today" with slack for Eastern time; the check below is only a hint
  const approvedToday = plan.installmentPayments.some((p) => p.status === "VERIFIED" && p.reviewedAt && p.reviewedAt > todayStart);
  const open = plan.installmentPayments.some((p) => p.status === "PENDING_REVIEW" || p.status === "AWAITING_TRANSFER");
  const taught = await prisma.classBooking.findMany({
    where: { studentId: plan.userId, status: "SCHEDULED", attendance: null, scheduledAt: { lt: new Date(), gt: new Date(Date.now() - 60 * 86_400_000) } },
    select: { id: true, scheduledAt: true, creditsSpent: true },
    orderBy: { scheduledAt: "desc" },
  });
  return {
    planId,
    studentName: plan.user.name ?? plan.user.email,
    amountCents: plan.installmentAmountCents,
    creditsPerPayment: plan.creditsPerInstallment,
    currentDueDate: plan.nextDueDate.toISOString(),
    newDueDate: addBillingCycles(new Date(), 1).toISOString(),
    payment: approvedToday ? "done" : open ? "open" : "new",
    taught: taught.map((b) => ({ id: b.id, scheduledAt: b.scheduledAt.toISOString(), creditsSpent: b.creditsSpent })),
    balance: plan.user.classCredits,
  };
}

export interface LateSettlementInput {
  /** Mark the payment received now. Off when it was already approved today. */
  recordPayment: boolean;
  /** The taught classes to charge (marked present, which spends their credit). */
  bookingIds: string[];
  /** Charge one class even though no booking exists for it (the lesson was never on the calendar). */
  chargeUnbookedClass: boolean;
}

export async function settleLatePayment(planId: string, adminId: string, input: LateSettlementInput): Promise<{ newDueDate: Date; charged: number }> {
  const plan = await loadPlan(planId);
  const userId = plan.userId;

  // Validate the classes first, so a bad pick changes nothing.
  const picked = input.bookingIds.length
    ? await prisma.classBooking.findMany({ where: { id: { in: input.bookingIds } }, select: { id: true, studentId: true, status: true, scheduledAt: true, creditsSpent: true } })
    : [];
  if (picked.length !== input.bookingIds.length || picked.some((b) => b.studentId !== userId || b.status !== "SCHEDULED" || b.scheduledAt.getTime() > Date.now())) {
    throw new PaymentPlanError("Pick only classes that already happened and are not marked yet.");
  }

  if (input.recordPayment) await recordPlanPaymentReceived(planId, adminId);

  // The next bill lands 28 days from today (the day they actually paid), and this cycle's credits last until then.
  const newDue = addBillingCycles(new Date(), 1);
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.paymentPlan.findUniqueOrThrow({ where: { id: planId }, select: { status: true } });
    if (fresh.status === "ACTIVE") await tx.paymentPlan.update({ where: { id: planId }, data: { nextDueDate: newDue } });
    const grant = await tx.creditGrant.findFirst({ where: { userId, paymentPlanId: planId, source: "PAYMENT_PLAN_INSTALLMENT", expiredAt: null }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (grant) await tx.creditGrant.update({ where: { id: grant.id }, data: { expiresAt: newDue } });
  });

  // Charge the classes that were taught on credit.
  for (const b of picked) await markAttendance(b.id, "PRESENT");
  let charged = picked.reduce((sum, b) => sum + b.creditsSpent, 0);
  if (input.chargeUnbookedClass) {
    await adjustUserCredits(adminId, userId, -CREDITS_PER_CLASS, "Class taught before the late payment arrived");
    charged += CREDITS_PER_CLASS;
  }

  // Classes inside the new paid period.
  await bookReservedWindowForPlan(planId).catch(() => undefined);

  await createNotification({
    userId,
    type: "PAYMENT_APPROVED",
    title: "Payment received",
    body: `Thank you. ${charged > 0 ? `${formatCredits(storedToCredits(charged))} credit${charged === CREDITS_PER_CLASS ? " was" : "s were"} used for the class you already took. ` : ""}Your next payment is due ${newDue.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" })}.`,
    emailCategory: "payments",
  });
  await logAudit({ actorId: adminId, action: "plan.settle-late", targetType: "PaymentPlan", targetId: planId, detail: `next bill ${newDue.toISOString().slice(0, 10)}, charged ${charged}` });
  return { newDueDate: newDue, charged };
}
