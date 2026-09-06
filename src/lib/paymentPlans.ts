import { PaymentPlanCadence, PaymentPlanTerm, type Prisma, type PaymentPlanStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePaymentPlanRate } from "@/lib/classCreditPricing";
import { createNotification } from "@/lib/notifications";

export class PaymentPlanError extends Error {}

// ---------------------------------------------------------------------------
// Enrollment
//
// A PaymentPlan is the standing commitment only (cadence, term, locked rate,
// progress) — it never moves money or grants credits itself. Every actual
// installment payment is an ordinary ZellePayment row (purpose
// PAYMENT_PLAN_INSTALLMENT), going through the exact same
// AWAITING_TRANSFER -> PENDING_REVIEW -> VERIFIED/REJECTED lifecycle, the
// exact same ZellePaymentModal/submitZellePaymentReference flow, and the
// exact same /admin/payments queue, as any other purchase — see
// approveZellePayment's PAYMENT_PLAN_INSTALLMENT branch in payments.ts.
// ---------------------------------------------------------------------------

/**
 * Starts a new payment plan. One ACTIVE plan per user at a time (v1
 * constraint, enforced here in application code — same class of trust as
 * getOrCreatePendingZellePayment's own dedup invariant in payments.ts, no DB
 * constraint backing it). Creates the PaymentPlan and installment #1's
 * ZellePayment as one nested Prisma write, atomic by construction — the
 * same trick createFamilyBundlePayment (payments.ts) already uses for its
 * nested familyBundleRecipients create, no explicit $transaction needed for
 * a single create() call.
 *
 * nextDueDate starts at "now" — a plan's first installment isn't a
 * reminder-ahead-of-time situation, it's the thing that actually starts the
 * plan.
 */
export async function createPaymentPlan(
  userId: string,
  cadence: PaymentPlanCadence,
  term: PaymentPlanTerm,
  zelleHandle: string,
) {
  // A Server Action's params are only compile-time-typed — a raw request
  // against the same endpoint could send anything. Validate against the
  // real enum before it ever reaches calculatePaymentPlanRate's lookup
  // tables, same "throw a clean error for bad input" convention
  // resolveDurationMin/parseHHMM already use in classSchedule.ts.
  if (!Object.values(PaymentPlanCadence).includes(cadence)) {
    throw new PaymentPlanError(`"${cadence}" isn't a valid cadence.`);
  }
  if (!Object.values(PaymentPlanTerm).includes(term)) {
    throw new PaymentPlanError(`"${term}" isn't a valid term.`);
  }

  const existing = await getActivePaymentPlan(userId);
  if (existing) {
    throw new PaymentPlanError("You already have an active payment plan. Finish or cancel it before starting another.");
  }

  const rate = calculatePaymentPlanRate(cadence, term);

  return prisma.paymentPlan.create({
    data: {
      userId,
      cadence,
      term,
      installmentAmountCents: rate.installmentAmountCents,
      creditsPerInstallment: rate.creditsPerInstallment,
      termMonths: rate.termMonths,
      nextDueDate: new Date(),
      installmentPayments: {
        create: [
          {
            userId,
            purpose: "PAYMENT_PLAN_INSTALLMENT",
            amountCents: rate.installmentAmountCents,
            zelleHandle,
            lessonQuantity: rate.creditsPerInstallment,
            installmentNumber: 1,
            status: "AWAITING_TRANSFER",
          },
        ],
      },
    },
    include: { installmentPayments: true },
  });
}

export async function getActivePaymentPlan(userId: string) {
  return prisma.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
}

/** A student's full plan history, newest first — active plus past completed/canceled ones. */
export async function getUserPaymentPlans(userId: string) {
  return prisma.paymentPlan.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export interface OpenInstallmentPayment {
  payment: Prisma.ZellePaymentGetPayload<Record<string, never>>;
  /** True only the instant this row was created by this call — the scheduled reminder function uses this (not a timestamp comparison) to send the "here's your invoice" notice exactly once per installment, regardless of how many times or how close together it runs while the row stays open. */
  wasCreated: boolean;
}

/**
 * The open (AWAITING_TRANSFER or PENDING_REVIEW) installment payment for a
 * plan, creating the next one from the plan's own locked rate if none exists
 * yet. Never recomputes amountCents from live pricing — a plan's rate is
 * locked at enrollment (see createPaymentPlan/calculatePaymentPlanRate).
 *
 * Deliberately does NOT reuse getOrCreatePendingZellePayment (payments.ts):
 * that helper's dedup key (userId+purpose+quantity) and its "refresh
 * amountCents on reuse" behavior are both wrong here — two different plans
 * can share a creditsPerInstallment, and an installment's amount must never
 * drift from what was promised at signup. Same reasoning FAMILY_BUNDLE
 * already has its own creation path instead of using that helper.
 *
 * Called from both the student's own billing page and the scheduled
 * reminder function, hence zelleHandle is a plain parameter rather than an
 * env read buried in here — same dependency-injection shape every other
 * pending-payment creator in this codebase already uses.
 */
export async function getOrCreateOpenInstallmentPayment(planId: string, zelleHandle: string): Promise<OpenInstallmentPayment> {
  const plan = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: planId } });

  const existing = await prisma.zellePayment.findFirst({
    where: { paymentPlanId: planId, status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return { payment: existing, wasCreated: false };

  const payment = await prisma.zellePayment.create({
    data: {
      userId: plan.userId,
      purpose: "PAYMENT_PLAN_INSTALLMENT",
      amountCents: plan.installmentAmountCents,
      zelleHandle,
      lessonQuantity: plan.creditsPerInstallment,
      installmentNumber: plan.installmentsPaid + 1,
      paymentPlanId: plan.id,
      status: "AWAITING_TRANSFER",
    },
  });
  return { payment, wasCreated: true };
}

// ---------------------------------------------------------------------------
// Calendar-month math
// ---------------------------------------------------------------------------

/**
 * Adds `months` calendar months to `date`, clamping the day-of-month so e.g.
 * Jan 31 + 1 month lands on Feb 28 (or 29), not rolling over into March the
 * way `Date`'s own overflow behavior would.
 */
export function addCalendarMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const originalDay = result.getDate();

  result.setDate(1); // park on a day that exists in every month first, so setMonth can't skip one while getDate() still holds an out-of-range value
  result.setMonth(result.getMonth() + months);

  const daysInTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, daysInTargetMonth));

  return result;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const adminPaymentPlanInclude = {
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PaymentPlanInclude;

export type AdminPaymentPlan = Prisma.PaymentPlanGetPayload<{ include: typeof adminPaymentPlanInclude }> & {
  isOverdue: boolean;
};

/**
 * Full admin plan listing, optionally filtered to one status. "Overdue" is
 * derived here (ACTIVE && nextDueDate already passed), never stored on the
 * row itself — nothing has to notice the date passed and flip a flag, so it
 * can't drift out of sync with reality.
 */
export async function getAdminPaymentPlans(status?: PaymentPlanStatus): Promise<AdminPaymentPlan[]> {
  const plans = await prisma.paymentPlan.findMany({
    where: status ? { status } : undefined,
    orderBy: { nextDueDate: "asc" },
    include: adminPaymentPlanInclude,
  });
  const now = Date.now();
  return plans.map((plan) => ({ ...plan, isOverdue: plan.status === "ACTIVE" && plan.nextDueDate.getTime() < now }));
}

/**
 * Admin-only cancellation — the sole way a plan stops early in v1 (no
 * student self-service cancel, matching how every other cancellation in
 * this app is already an explicit, human-triggered action; a student who
 * wants to stop messages the admin, the same way an inside-24h class
 * cancellation already works). Only flips the plan's own status/audit
 * fields — deliberately does not touch any in-flight installment payment.
 * Once a plan drops out of ACTIVE it disappears from the student's "current
 * plan" view (the only normal path to that installment's payment gate), and
 * the scheduled reminder function's overdue query is filtered to
 * `paymentPlan.status === "ACTIVE"`, so a stray open installment simply
 * stops generating reminders on its own — no second write path to keep in
 * sync.
 */
export async function cancelPaymentPlan(planId: string, adminId: string, note: string): Promise<void> {
  const plan = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: planId } });
  if (plan.status !== "ACTIVE") {
    throw new PaymentPlanError(`This plan isn't active (status: ${plan.status}).`);
  }

  const trimmedNote = note.trim();
  if (!trimmedNote) {
    throw new PaymentPlanError("A cancellation note is required.");
  }

  await prisma.paymentPlan.update({
    where: { id: planId },
    data: { status: "CANCELED", canceledAt: new Date(), canceledById: adminId, cancellationNote: trimmedNote },
  });

  await createNotification({
    userId: plan.userId,
    type: "PAYMENT_PLAN_CANCELED",
    title: "Payment plan canceled",
    body: `Your payment plan was canceled: ${trimmedNote}`,
    emailCategory: "payments",
  });
}
