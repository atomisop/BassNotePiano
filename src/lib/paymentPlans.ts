import { PaymentPlanCadence, PaymentPlanTerm, type Prisma, type PaymentPlanStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePaymentPlanRate, PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";
import { chunksForSchedule, livePaymentPlanConditions, nextOccurrenceDates, computeScheduledAt, OCCURRENCES_PER_SLOT } from "@/lib/classSchedule";
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
 * Starts a new payment plan against a specific reserved weekly slot. One
 * ACTIVE plan per user at a time, and one live reservation per
 * schedule+chunk at a time — both v1 constraints, both enforced here inside
 * a single Serializable transaction (matching bookClass's own pattern in
 * classSchedule.ts for scarce weekly resources), not two separate
 * un-transacted checks: the previous version's "one active plan" check ran
 * before the write with no transaction backing it at all, a real gap this
 * closes at the same time as adding the slot-exclusivity check. Creates the
 * PaymentPlan and installment #1's ZellePayment as one nested Prisma write
 * inside that transaction, same trick createFamilyBundlePayment
 * (payments.ts) uses for its own nested create.
 *
 * nextDueDate starts at "now" — a plan's first installment isn't a
 * reminder-ahead-of-time situation, it's the thing that actually starts the
 * plan. The reserved slot's first actual booking isn't created here either
 * — that's left to the next run of the daily reservation-maintenance job
 * (netlify/functions/payment-plan-reservations.ts), the same single code
 * path that creates every subsequent week's booking too.
 */
export async function createPaymentPlan(
  userId: string,
  cadence: PaymentPlanCadence,
  term: PaymentPlanTerm,
  zelleHandle: string,
  reservedScheduleId: string,
  reservedChunkIndex: number,
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

  const rate = calculatePaymentPlanRate(cadence, term);
  const creditsPerWeek = PLAN_CADENCE_CREDITS_PER_WEEK[cadence];

  try {
    return await prisma.$transaction(
      async (tx) => {
        const existingPlan = await tx.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" } });
        if (existingPlan) {
          throw new PaymentPlanError("You already have an active payment plan. Finish or cancel it before starting another.");
        }

        const schedule = await tx.classSchedule.findUniqueOrThrow({ where: { id: reservedScheduleId } });
        if (!schedule.active) throw new PaymentPlanError("That class time is no longer offered — pick another.");
        const chunk = chunksForSchedule(schedule)[reservedChunkIndex];
        if (!chunk) throw new PaymentPlanError("That time slot doesn't exist.");
        if (chunk.creditCost < creditsPerWeek) {
          throw new PaymentPlanError("That time slot is too short for this cadence.");
        }

        const reservedByAnother = await tx.paymentPlan.findFirst({
          where: { reservedScheduleId, reservedChunkIndex, OR: livePaymentPlanConditions() },
          select: { id: true },
        });
        if (reservedByAnother) throw new PaymentPlanError("That slot was just taken — try again.");

        // A chunk with no other PaymentPlan reservation can still have a
        // pre-existing ordinary ClassBooking (from the self-serve bookClass/
        // bookFamilyClass flow, made before this reservation existed) on
        // one of its own upcoming OCCURRENCES_PER_SLOT occurrences —
        // reserving over that would let the daily maintenance job silently
        // create a second, conflicting booking for that same instant the
        // next time it runs. Checked against the exact same rolling window
        // the job itself maintains; excludes this same student's own
        // pre-existing booking (nothing wrong with reserving over your own
        // booking — the job's own existing-row check already handles that
        // cleanly).
        const occurrenceDates = nextOccurrenceDates(schedule.dayOfWeek, OCCURRENCES_PER_SLOT);
        const conflictingBooking = await tx.classBooking.findFirst({
          where: {
            scheduleId: reservedScheduleId,
            status: "SCHEDULED",
            studentId: { not: userId },
            OR: occurrenceDates.map((occurrenceDate) => ({ occurrenceDate, scheduledAt: computeScheduledAt(schedule, occurrenceDate, chunk) })),
          },
          select: { id: true },
        });
        if (conflictingBooking) {
          throw new PaymentPlanError("Someone already has a booking on one of this slot's upcoming weeks — pick another time.");
        }

        return tx.paymentPlan.create({
          data: {
            userId,
            cadence,
            term,
            installmentAmountCents: rate.installmentAmountCents,
            creditsPerInstallment: rate.creditsPerInstallment,
            termMonths: rate.termMonths,
            nextDueDate: new Date(),
            reservedScheduleId,
            reservedChunkIndex,
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
      },
      { isolationLevel: "Serializable" },
    );
  } catch (err) {
    if (err instanceof PaymentPlanError) throw err;
    if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2034") {
      throw new PaymentPlanError("That slot was just taken — try again.");
    }
    throw err;
  }
}

export async function getActivePaymentPlan(userId: string) {
  return prisma.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
}

/** A student's full plan history, newest first — active plus past completed/canceled ones. */
export async function getUserPaymentPlans(userId: string) {
  return prisma.paymentPlan.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

// How far ahead of nextDueDate the *next* installment becomes payable at
// all. Exported (not a local const in the scheduled function anymore) so
// both callers of getOrCreateOpenInstallmentPayment below share the exact
// same number. This used to live only in netlify/functions/payment-plan-
// installments.ts, governing when the *automated* reminder opened one, with
// no equivalent gate on the student's own /billing/plans page. That gap is
// exactly what let a student pay ahead of schedule, installment after
// installment, back to back in one sitting, instead of one a month, adding
// up to a 12-month plan's whole year of credits landing at once by direct
// instruction, this is now closed: getOrCreateOpenInstallmentPayment
// enforces this window itself, so neither caller can reopen it by accident.
export const INSTALLMENT_OPEN_LEAD_DAYS = 7;

export interface OpenInstallmentPayment {
  /** Null when the plan has no open installment *and* isn't within INSTALLMENT_OPEN_LEAD_DAYS of its next one yet. See nextDueDate below for when it will be. */
  payment: Prisma.ZellePaymentGetPayload<Record<string, never>> | null;
  /** True only the instant this row was created by this call — the scheduled reminder function uses this (not a timestamp comparison) to send the "here's your invoice" notice exactly once per installment, regardless of how many times or how close together it runs while the row stays open. */
  wasCreated: boolean;
  /** Set only when payment is null: the plan's own nextDueDate, so the caller can render "your next installment opens on X" instead of silently showing nothing. */
  nextDueDate?: Date;
}

/**
 * The open (AWAITING_TRANSFER or PENDING_REVIEW) installment payment for a
 * plan, creating the next one from the plan's own locked rate if none exists
 * yet AND the plan's nextDueDate is within INSTALLMENT_OPEN_LEAD_DAYS (or
 * already past). Outside that window, this deliberately creates nothing and
 * returns payment: null. One Zelle payment a month is the actual product,
 * not "pay however many months you want, whenever you want": without this
 * gate, a student who finishes an installment can immediately trigger the
 * next one the moment they're back on /billing/plans (nothing else ever
 * checked nextDueDate before creating), and repeat that indefinitely to
 * front-load an entire term's worth of credits in one sitting. Never
 * recomputes amountCents from live pricing either way, a plan's rate is
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
 * pending-payment creator in this codebase already uses. `now` is likewise a
 * parameter (defaulting to the real clock) purely so a caller (or a future
 * test) can pin it, the same pattern expireDueCreditGrants already uses.
 */
export async function getOrCreateOpenInstallmentPayment(
  planId: string,
  zelleHandle: string,
  now: Date = new Date(),
): Promise<OpenInstallmentPayment> {
  const plan = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: planId } });

  const existing = await prisma.zellePayment.findFirst({
    where: { paymentPlanId: planId, status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return { payment: existing, wasCreated: false };

  const opensAt = new Date(plan.nextDueDate.getTime() - INSTALLMENT_OPEN_LEAD_DAYS * 24 * 60 * 60 * 1000);
  if (now < opensAt) {
    return { payment: null, wasCreated: false, nextDueDate: plan.nextDueDate };
  }

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
  reservedSchedule: { select: { id: true, label: true, dayOfWeek: true, startTime: true } },
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
 * cancellation already works). Flips the plan's own status/audit fields and
 * bulk-cancels its future auto-created reserved bookings (reservedByPlanId)
 * in one transaction — frees the slot immediately rather than leaving it
 * sitting booked-but-uncharged until each occurrence's own scheduledAt
 * passes. Deliberately does not touch any in-flight installment payment: a
 * canceled plan drops out of "current plan" (the only normal path to that
 * installment's payment gate), and the scheduled reminder function's
 * overdue query is filtered to `paymentPlan.status === "ACTIVE"`, so a
 * stray open installment simply stops generating reminders on its own — no
 * second write path to keep in sync.
 */
export async function cancelPaymentPlan(planId: string, adminId: string, note: string): Promise<void> {
  const trimmedNote = note.trim();
  if (!trimmedNote) {
    throw new PaymentPlanError("A cancellation note is required.");
  }

  const plan = await prisma.$transaction(async (tx) => {
    const current = await tx.paymentPlan.findUniqueOrThrow({ where: { id: planId } });
    if (current.status !== "ACTIVE") {
      throw new PaymentPlanError(`This plan isn't active (status: ${current.status}).`);
    }

    await tx.paymentPlan.update({
      where: { id: planId },
      data: { status: "CANCELED", canceledAt: new Date(), canceledById: adminId, cancellationNote: trimmedNote },
    });

    // Only the plan's own auto-created future bookings — never a booking
    // the student separately made by hand for something else.
    await tx.classBooking.updateMany({
      where: { reservedByPlanId: planId, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
      data: { status: "CANCELED", refunded: true },
    });

    return current;
  });

  await createNotification({
    userId: plan.userId,
    type: "PAYMENT_PLAN_CANCELED",
    title: "Payment plan canceled",
    body: `Your payment plan was canceled: ${trimmedNote}`,
    emailCategory: "payments",
  });
}
