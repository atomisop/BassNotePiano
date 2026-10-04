import { PaymentPlanCadence, PaymentPlanTerm, PlanCancellationReason, type Prisma, type PaymentPlanStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePaymentPlanRate, describePaymentPlan, isPlanTermOffered, PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";
import {
  chunksForSchedule,
  livePaymentPlanConditions,
  nextOccurrenceDates,
  computeScheduledAt,
  createReservedBookingIfAbsent,
  OCCURRENCES_PER_SLOT,
} from "@/lib/classSchedule";
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

  if (!isPlanTermOffered(term)) {
    throw new PaymentPlanError("That plan length is no longer offered. Pick Monthly, 3-Month, or 6-Month.");
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

const feedbackInclude = {
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PaymentPlanInclude;

export type PlanCancellationFeedback = Prisma.PaymentPlanGetPayload<{ include: typeof feedbackInclude }>;

/**
 * Every self-canceled plan that left a reason, newest first, for the
 * Feedback tab of /admin/payment-plans. cancellationReason is only ever set by
 * cancelPaymentPlanBySelf above, so this never surfaces an admin
 * cancellation (cancellationNote, a distinct field, is that one's own
 * free-text and stays admin-only, out of scope for this reader).
 */
export async function getPlanCancellationFeedback(): Promise<PlanCancellationFeedback[]> {
  return prisma.paymentPlan.findMany({
    where: { cancellationReason: { not: null } },
    orderBy: { canceledAt: "desc" },
    include: feedbackInclude,
  });
}

/**
 * Admin cancellation, note required, canceledById is the admin who acted.
 * A student can also cancel their own plan now (cancelPaymentPlanBySelf
 * below), this one is specifically for an admin doing it on a student's
 * behalf (a support conversation resolved that way, say). Flips the plan's
 * own status/audit fields and bulk-cancels its future auto-created reserved
 * bookings (reservedByPlanId) in one transaction, frees the slot
 * immediately rather than leaving it sitting booked-but-uncharged until
 * each occurrence's own scheduledAt passes. Deliberately does not touch any
 * in-flight installment payment: a canceled plan drops out of "current
 * plan" (the only normal path to that installment's payment gate), and the
 * scheduled reminder function's overdue query is filtered to
 * `paymentPlan.status === "ACTIVE"`, so a stray open installment simply
 * stops generating reminders on its own, no second write path to keep in
 * sync.
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

// ---------------------------------------------------------------------------
// Self-service: term changes and cancellation, from /account's "Manage
// Subscriptions" tab.
// ---------------------------------------------------------------------------

/**
 * Blocks a term change (or a self-cancel, see cancelPaymentPlanBySelf
 * below) while an installment is already in flight, so neither action ever
 * has to reconcile against a payment that was created under the old term's
 * rate. A student just waits until they're "all paid up" (the same state
 * PaymentPlanEnrollmentFlow already shows between installments) before
 * changing anything.
 */
async function assertNoOpenInstallment(planId: string): Promise<void> {
  const openPayment = await prisma.zellePayment.findFirst({
    where: { paymentPlanId: planId, status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] } },
    select: { id: true },
  });
  if (openPayment) {
    throw new PaymentPlanError("You have a payment in progress right now. Finish or wait for that to clear, then change your plan.");
  }
}

/**
 * Self-service term change, same cadence and reserved slot, a new term.
 * "Upgrade" (a longer term) and "downgrade" (a shorter one) are the exact
 * same operation in either direction: recompute the rate for newTerm at the
 * plan's existing cadence and take it over for every installment from here
 * on. installmentsPaid carries forward unchanged, it's real payment
 * history, not something a term change should erase; an already-created
 * installment's own snapshotted amountCents never changes either (see
 * ZellePayment.installmentNumber's own comment on why those stay put).
 *
 * Refuses a change to any term whose own termMonths is at or below what's
 * already been paid. Allowing that would let a student capture a longer
 * term's deeper discount rate (30% off for TERM_12, say), pay exactly one
 * installment at that rate, then "downgrade" to MONTHLY and have the plan
 * immediately marked COMPLETED, having genuinely honored only one month of
 * a twelve-month-priced commitment, repeatably (COMPLETED, not CANCELED,
 * doesn't block re-enrolling and doing it again). If a student wants to
 * stop paying with fewer installments in than their current term's rate
 * assumes, that's a cancellation (cancelPaymentPlanBySelf below), not a
 * term change, one that's honestly recorded as canceled early rather than
 * dressed up as a completed shorter plan they were never actually on.
 */
export async function changePaymentPlanTerm(userId: string, newTerm: PaymentPlanTerm): Promise<void> {
  if (!Object.values(PaymentPlanTerm).includes(newTerm)) {
    throw new PaymentPlanError(`"${newTerm}" isn't a valid term.`);
  }

  const plan = await prisma.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" } });
  if (!plan) throw new PaymentPlanError("You don't have an active payment plan.");
  if (plan.term === newTerm) throw new PaymentPlanError("You're already on this term.");

  await assertNoOpenInstallment(plan.id);

  const rate = calculatePaymentPlanRate(plan.cadence, newTerm);
  if (plan.installmentsPaid >= rate.termMonths) {
    throw new PaymentPlanError(
      "You've already paid enough installments that this term wouldn't ask for any more. If you want to stop here, cancel your plan instead.",
    );
  }

  await prisma.paymentPlan.update({
    where: { id: plan.id },
    data: {
      term: newTerm,
      installmentAmountCents: rate.installmentAmountCents,
      creditsPerInstallment: rate.creditsPerInstallment,
      termMonths: rate.termMonths,
    },
  });
}

/**
 * Self-service reschedule of a Payment Plan subscriber's own standing
 * weekly slot — by direct instruction, the one big piece of Payment Plan
 * self-service that never existed: bookClass refuses a subscriber's ad hoc
 * self-booking entirely (see its own comment), so up to now the only way to
 * move a standing reservation to a different day/time was messaging support.
 * Same conflict-checking shape as createPaymentPlan's own enrollment-time
 * check (another live plan already holding this exact chunk, or a
 * pre-existing ordinary ClassBooking on one of its upcoming occurrences),
 * run inside one Serializable transaction for the same reason: this is a
 * scarce weekly resource two people could otherwise both grab at once.
 *
 * Effective immediately, not just from the next scheduled-job run: this
 * cancels the student's own still-SCHEDULED future bookings tied to the OLD
 * reserved slot (freeing it for someone else right away, same no-charge
 * shape as cancelClassBooking — nothing was ever actually charged against a
 * SCHEDULED-but-not-yet-attended booking) and immediately books the NEW
 * slot's own upcoming occurrences via createReservedBookingIfAbsent, the
 * exact same building block payment-plan-reservations.ts's daily job calls
 * — so a student doesn't wait up to 24h to see their new day/time actually
 * reflected in their upcoming classes.
 */
export async function changeReservedSlot(userId: string, newScheduleId: string, newChunkIndex: number) {
  const { plan, chunk, schedule } = await prisma.$transaction(
    async (tx) => {
      const plan = await tx.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" } });
      if (!plan) throw new PaymentPlanError("You don't have an active payment plan.");
      if (!plan.reservedScheduleId || plan.reservedChunkIndex === null) {
        throw new PaymentPlanError("Your plan doesn't have a reserved slot yet — message us and we'll help.");
      }
      if (plan.reservedScheduleId === newScheduleId && plan.reservedChunkIndex === newChunkIndex) {
        throw new PaymentPlanError("That's already your weekly time.");
      }

      const schedule = await tx.classSchedule.findUniqueOrThrow({ where: { id: newScheduleId } });
      if (!schedule.active) throw new PaymentPlanError("That class time is no longer offered — pick another.");
      const chunk = chunksForSchedule(schedule)[newChunkIndex];
      if (!chunk) throw new PaymentPlanError("That time slot doesn't exist.");
      const creditsPerWeek = PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence];
      if (chunk.creditCost < creditsPerWeek) {
        throw new PaymentPlanError("That time slot is too short for this cadence.");
      }

      const reservedByAnother = await tx.paymentPlan.findFirst({
        where: { reservedScheduleId: newScheduleId, reservedChunkIndex: newChunkIndex, userId: { not: userId }, OR: livePaymentPlanConditions() },
        select: { id: true },
      });
      if (reservedByAnother) throw new PaymentPlanError("That slot was just taken — try again.");

      const occurrenceDates = nextOccurrenceDates(schedule.dayOfWeek, OCCURRENCES_PER_SLOT);
      const conflictingBooking = await tx.classBooking.findFirst({
        where: {
          scheduleId: newScheduleId,
          status: "SCHEDULED",
          studentId: { not: userId },
          OR: occurrenceDates.map((occurrenceDate) => ({ occurrenceDate, scheduledAt: computeScheduledAt(schedule, occurrenceDate, chunk) })),
        },
        select: { id: true },
      });
      if (conflictingBooking) {
        throw new PaymentPlanError("Someone already has a booking on one of this slot's upcoming weeks — pick another time.");
      }

      // Frees the old slot right away — same no-charge cancellation as
      // cancelClassBooking, just triggered by the reservation moving rather
      // than the student canceling one class at a time.
      await tx.classBooking.updateMany({
        where: { studentId: userId, reservedByPlanId: plan.id, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
        data: { status: "CANCELED", refunded: true },
      });

      const updatedPlan = await tx.paymentPlan.update({
        where: { id: plan.id },
        data: { reservedScheduleId: newScheduleId, reservedChunkIndex: newChunkIndex },
      });

      return { plan: updatedPlan, chunk, schedule };
    },
    { isolationLevel: "Serializable" },
  );

  // Best-effort, one occurrence at a time, same non-blocking posture as the
  // daily maintenance job this mirrors — a hiccup on one week doesn't fail
  // the reschedule itself (the plan's new reservedScheduleId/
  // reservedChunkIndex already committed above); the next day's job run
  // would catch up on whatever this loop missed regardless.
  for (const occurrenceDate of nextOccurrenceDates(schedule.dayOfWeek, OCCURRENCES_PER_SLOT)) {
    const scheduledAt = computeScheduledAt(schedule, occurrenceDate, chunk);
    if (scheduledAt.getTime() <= Date.now()) continue;
    try {
      await createReservedBookingIfAbsent({
        studentId: userId,
        scheduleId: newScheduleId,
        occurrenceDate,
        scheduledAt,
        // The plan's own weekly amount (1 or 2 credits), not the time block's full size.
        creditsSpent: PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence],
        planId: plan.id,
      });
    } catch (err) {
      console.error(`changeReservedSlot: failed to book occurrence ${occurrenceDate.toISOString()} for plan ${plan.id} (non-blocking, next daily run will catch up):`, err);
    }
  }

  await createNotification({
    userId,
    type: "RESERVED_SLOT_CHANGED",
    title: "Your weekly class time changed",
    body: "Your standing weekly class moved to a new day/time — check Lessons for your updated schedule.",
    emailCategory: "payments",
  }).catch((err) => console.error("RESERVED_SLOT_CHANGED notification failed (non-blocking):", err));

  return plan;
}

/**
 * Self-service cancellation from /account. Unlike the admin path above, a
 * student always has to pick a reason (see PlanCancellationReason in
 * schema.prisma), required so the Feedback tab of /admin/payment-plans has something real to read,
 * not an empty note nobody bothered filling in. canceledById is set to the
 * student's own id, same field an admin cancellation uses for "who acted,"
 * a plan's history reads the same way regardless of who did it.
 *
 * The actual "would you rather downgrade to 3 months" prompt for a TERM_6/
 * TERM_12 plan lives entirely in the UI (ManageSubscriptions.tsx), this
 * function only ever cancels, on purpose: by the time this runs, the
 * student has already seen that offer and chosen to cancel anyway (or
 * they're on MONTHLY/TERM_3, where there's no shorter term to offer).
 */
export async function cancelPaymentPlanBySelf(
  userId: string,
  reason: PlanCancellationReason,
  reasonNote: string | null,
): Promise<void> {
  if (!Object.values(PlanCancellationReason).includes(reason)) {
    throw new PaymentPlanError(`"${reason}" isn't a valid reason.`);
  }
  const trimmedNote = reasonNote?.trim() || null;
  if (reason === "OTHER" && !trimmedNote) {
    throw new PaymentPlanError('Tell us a bit more since you picked "Other."');
  }

  const plan = await prisma.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" } });
  if (!plan) throw new PaymentPlanError("You don't have an active payment plan.");

  await assertNoOpenInstallment(plan.id);

  await prisma.$transaction(async (tx) => {
    await tx.paymentPlan.update({
      where: { id: plan.id },
      data: {
        status: "CANCELED",
        canceledAt: new Date(),
        canceledById: userId,
        cancellationReason: reason,
        cancellationReasonNote: trimmedNote,
      },
    });

    await tx.classBooking.updateMany({
      where: { reservedByPlanId: plan.id, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
      data: { status: "CANCELED", refunded: true },
    });
  });

  await createNotification({
    userId,
    type: "PAYMENT_PLAN_CANCELED",
    title: "Payment plan canceled",
    body: "Your payment plan was canceled. Your reserved weekly time is now open again.",
    emailCategory: "payments",
  });

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: "PLAN_CANCELLATION_FEEDBACK",
        title: "A student canceled their plan",
        body: `${describePaymentPlan(plan.cadence, plan.term)} was self-canceled. See Payment Plans → Feedback for their reason.`,
      }),
    ),
  );
}
