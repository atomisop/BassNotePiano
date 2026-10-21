import { noticePlanUpdated } from "@/lib/studentNotices";
import { getNumberSetting } from "@/lib/siteSettings";
import { getAdminRecipients, notifyAdmins } from "@/lib/adminNotifications";
import { addMinutesToHHmm } from "@/lib/classScheduleLabels";
import { PaymentPlanCadence, PaymentPlanTerm, PlanCancellationReason, type Prisma, type PaymentPlan, type PaymentPlanStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasFirstAndLastName } from "@/lib/studentName";
import { namesMatch } from "@/lib/personNames";
import { calculateFamilyBundleTotal, calculatePaymentPlanRate, describePaymentPlan, discountedPlanPriceCents, isPlanTermOffered, isPlanCadenceOffered, PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";
import { getPricingConfig } from "@/lib/pricing";
import { getDiscountPercent } from "@/lib/accountDiscounts";
import {
  chunksForSchedule,
  classesInWindow,
  classStartsInWindow,
  classOccurrencesInWindow,
  livePaymentPlanConditions,
  nextOccurrenceDates,
  computeScheduledAt,
  createReservedBookingIfAbsent,
  getEffectiveClassCredits,
  OCCURRENCES_PER_SLOT, CANCELLATION_CUTOFF_HOURS } from "@/lib/classSchedule";
import { createNotification } from "@/lib/notifications";
import { grantCredits } from "@/lib/creditLedger";
import { PAUSE_REASON, pauseBlockedReason, pauseSpanMs } from "@/lib/planPause";
import { logAudit } from "@/lib/audit";

export class PaymentPlanError extends Error {}

// ---------------------------------------------------------------------------
// Enrollment
//
// A PaymentPlan is the standing commitment only (cadence, term, locked rate,
// progress), it never moves money or grants credits itself. Every actual
// installment payment is an ordinary ZellePayment row (purpose
// PAYMENT_PLAN_INSTALLMENT), going through the exact same
// AWAITING_TRANSFER -> PENDING_REVIEW -> VERIFIED/REJECTED lifecycle, the
// exact same ZellePaymentModal/submitZellePaymentReference flow, and the
// exact same /admin/payments queue, as any other purchase, see
// approveZellePayment's PAYMENT_PLAN_INSTALLMENT branch in payments.ts.
// ---------------------------------------------------------------------------

/**
 * Checks that a weekly time can be reserved for these students: it exists, is offered, is long enough, is not held by another
 * live plan, and no one outside these students already has a booking on its coming weeks. Throws PaymentPlanError otherwise.
 * Shared by a solo plan (one student) and a family plan (all members share the one time).
 */
async function assertSlotReservable(
  tx: Prisma.TransactionClient,
  scheduleId: string,
  chunkIndex: number,
  creditsPerWeek: number,
  memberIds: string[],
  ignorePlanIds: string[] = [],
): Promise<void> {
  const schedule = await tx.classSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
  if (!schedule.active) throw new PaymentPlanError("That class time is no longer offered. Pick another.");
  const chunk = chunksForSchedule(schedule)[chunkIndex];
  if (!chunk) throw new PaymentPlanError("That time slot doesn't exist.");
  if (chunk.creditCost < creditsPerWeek) {
    throw new PaymentPlanError("That time slot is too short for this cadence.");
  }

  const reservedByAnother = await tx.paymentPlan.findFirst({
    where: { reservedScheduleId: scheduleId, reservedChunkIndex: chunkIndex, id: { notIn: ignorePlanIds }, OR: livePaymentPlanConditions() },
    select: { id: true },
  });
  if (reservedByAnother) throw new PaymentPlanError("That slot was just taken. Try again.");

  // A chunk with no other PaymentPlan reservation can still have a
  // pre-existing ordinary ClassBooking (from the self-serve bookClass/
  // bookFamilyClass flow, made before this reservation existed) on
  // one of its own upcoming OCCURRENCES_PER_SLOT occurrences,
  // reserving over that would let the daily maintenance job silently
  // create a second, conflicting booking for that same instant the
  // next time it runs. Checked against the exact same rolling window
  // the job itself maintains; excludes this same student's own
  // pre-existing booking (nothing wrong with reserving over your own
  // booking, the job's own existing-row check already handles that
  // cleanly).
  const occurrenceDates = nextOccurrenceDates(schedule.dayOfWeek, OCCURRENCES_PER_SLOT);
  const conflictingBooking = await tx.classBooking.findFirst({
    where: {
      scheduleId: scheduleId,
      status: "SCHEDULED",
      studentId: { notIn: memberIds },
      OR: occurrenceDates.map((occurrenceDate) => ({ occurrenceDate, scheduledAt: computeScheduledAt(schedule, occurrenceDate, chunk) })),
    },
    select: { id: true },
  });
  if (conflictingBooking) {
    throw new PaymentPlanError("Someone already has a booking on one of this slot's upcoming weeks. Pick another time.");
  }
}

/**
 * Starts a new payment plan against a specific reserved weekly slot. One
 * ACTIVE plan per user at a time, and one live reservation per
 * schedule+chunk at a time, both v1 constraints, both enforced here inside
 * a single Serializable transaction (matching bookClass's own pattern in
 * classSchedule.ts for scarce weekly resources), not two separate
 * un-transacted checks: the previous version's "one active plan" check ran
 * before the write with no transaction backing it at all, a real gap this
 * closes at the same time as adding the slot-exclusivity check. Creates the
 * PaymentPlan and installment #1's ZellePayment as one nested Prisma write
 * inside that transaction, same trick createFamilyBundlePayment
 * (payments.ts) uses for its own nested create.
 *
 * nextDueDate starts at "now", a plan's first installment isn't a
 * reminder-ahead-of-time situation, it's the thing that actually starts the
 * plan. The reserved slot's first actual booking isn't created here either,
 * that's left to the next run of the daily reservation-maintenance job
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
  // A Server Action's params are only compile-time-typed, a raw request
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

  if (!isPlanCadenceOffered(cadence)) {
    throw new PaymentPlanError("That weekly length isn't offered anymore. Classes are 45 minutes a week.");
  }
  if (!isPlanTermOffered(term)) {
    throw new PaymentPlanError("That plan length is no longer offered. Pick Monthly, 3-Month, or 6-Month.");
  }

  const pricing = await getPricingConfig();
  const rate = calculatePaymentPlanRate(cadence, term, pricing);
  // The owner's personal discount for this account (Admin > Pricing): the plan is created at the discounted price, and the price before
  // it is kept so the discount can be changed or removed later.
  const discountPercent = await getDiscountPercent(userId);
  const installmentCents = discountedPlanPriceCents(rate.installmentAmountCents, discountPercent);
  const creditsPerWeek = PLAN_CADENCE_CREDITS_PER_WEEK[cadence];

  try {
    const created = await prisma.$transaction(
      async (tx) => {
        const existingPlan = await tx.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" } });
        if (existingPlan) {
          throw new PaymentPlanError("You already have an active payment plan. Finish or cancel it before starting another.");
        }

        await assertSlotReservable(tx, reservedScheduleId, reservedChunkIndex, creditsPerWeek, [userId]);

        return tx.paymentPlan.create({
          data: {
            userId,
            cadence,
            term,
            installmentAmountCents: installmentCents,
            listAmountCents: discountPercent > 0 ? rate.installmentAmountCents : null,
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
                  amountCents: installmentCents,
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

    // Practice and class reminders are on for everyone who subscribes (the owner's rule). They can turn them off in Settings;
    // this runs only when a plan is created, so it never overrides that later choice.
    await prisma.user.update({ where: { id: userId }, data: { notifyEmailReminders: true } });
    await noticePlanUpdated({
      userId,
      title: "Your plan is set up",
      body: `${describePaymentPlan(cadence, term)} is set up. Send the first installment (${(created.installmentAmountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}) to start your classes.`,
    });
    return created;
  } catch (err) {
    if (err instanceof PaymentPlanError) throw err;
    if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2034") {
      throw new PaymentPlanError("That slot was just taken. Try again.");
    }
    throw err;
  }
}

export async function getActivePaymentPlan(userId: string) {
  return prisma.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
}

/** A student's full plan history, newest first, active plus past completed/canceled ones. */
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
  /** True only the instant this row was created by this call, the scheduled reminder function uses this (not a timestamp comparison) to send the "here's your invoice" notice exactly once per installment, regardless of how many times or how close together it runs while the row stays open. */
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
 * amountCents on reuse" behavior are both wrong here, two different plans
 * can share a creditsPerInstallment, and an installment's amount must never
 * drift from what was promised at signup. Same reasoning FAMILY_BUNDLE
 * already has its own creation path instead of using that helper.
 *
 * Called from both the student's own billing page and the scheduled
 * reminder function, hence zelleHandle is a plain parameter rather than an
 * env read buried in here, same dependency-injection shape every other
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

  // A family member's first month is paid inside the family's one combined start payment, never as a bill of its own.
  if (plan.familyGroupId && plan.installmentsPaid === 0) return { payment: null, wasCreated: false, nextDueDate: plan.nextDueDate };

  const existing = await prisma.zellePayment.findFirst({
    where: { paymentPlanId: planId, status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return { payment: existing, wasCreated: false };

  const opensAt = new Date(plan.nextDueDate.getTime() - (await getNumberSetting("payments.installmentLeadDays")) * 24 * 60 * 60 * 1000);
  if (now < opensAt) {
    return { payment: null, wasCreated: false, nextDueDate: plan.nextDueDate };
  }

  // A family plan needs at least two paying people. Down to one, the person pays the solo price from this bill on.
  let amountCents = plan.installmentAmountCents;
  if (plan.familyGroupId && (await activeFamilySize(plan.familyGroupId)) < 2) {
    amountCents = calculatePaymentPlanRate(plan.cadence, plan.term, await getPricingConfig()).installmentAmountCents;
  }

  const payment = await prisma.zellePayment.create({
    data: {
      userId: plan.userId,
      purpose: "PAYMENT_PLAN_INSTALLMENT",
      amountCents,
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
  reservedSchedule: { select: { id: true, label: true, dayOfWeek: true, startTime: true, durationMin: true } },
  installmentPayments: { select: { id: true, status: true, amountCents: true } },
  familyGroup: { select: { payer: { select: { name: true, email: true } }, _count: { select: { plans: true } } } },
} satisfies Prisma.PaymentPlanInclude;

export type AdminPaymentPlan = Prisma.PaymentPlanGetPayload<{ include: typeof adminPaymentPlanInclude }> & {
  isOverdue: boolean;
};

/**
 * Full admin plan listing, optionally filtered to one status. "Overdue" is
 * derived here (ACTIVE && nextDueDate already passed), never stored on the
 * row itself, nothing has to notice the date passed and flip a flag, so it
 * can't drift out of sync with reality.
 */
export async function getAdminPaymentPlans(status?: PaymentPlanStatus): Promise<AdminPaymentPlan[]> {
  const plans = await prisma.paymentPlan.findMany({
    where: status ? { status } : undefined,
    orderBy: { nextDueDate: "asc" },
    include: adminPaymentPlanInclude,
  });
  const now = Date.now();
  return plans.map((plan) => ({
    ...plan,
    // Show the plan's own piece of the window (e.g. 12:00 PM), not the window's start.
    reservedSchedule:
      plan.reservedSchedule && plan.reservedChunkIndex !== null
        ? {
            ...plan.reservedSchedule,
            startTime: addMinutesToHHmm(plan.reservedSchedule.startTime, chunksForSchedule(plan.reservedSchedule)[plan.reservedChunkIndex]?.offsetMin ?? 0),
          }
        : plan.reservedSchedule,
    isOverdue: plan.status === "ACTIVE" && plan.nextDueDate.getTime() < now,
  }));
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

    // Only the plan's own auto-created future bookings, never a booking
    // the student separately made by hand for something else.
    await tx.classBooking.updateMany({
      where: { reservedByPlanId: planId, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
      data: { status: "CANCELED", refunded: true },
    });

    // The plan's bill nobody paid is closed with it. Left open, it kept showing "awaiting payment" under a canceled plan.
    // A payment the student already submitted (PENDING_REVIEW) is left for the owner: it may be real money.
    await tx.zellePayment.updateMany({ where: { paymentPlanId: planId, status: "AWAITING_TRANSFER" }, data: { status: "EXPIRED" } });

    return current;
  });

  await createNotification({
    userId: plan.userId,
    type: "PAYMENT_PLAN_CANCELED",
    title: "Payment plan canceled",
    body: `Your payment plan was canceled: ${trimmedNote}`,
    emailCategory: "payments",
  });
  await afterFamilyPlanEnded(plan);
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
  // An installment the student opened but never said they paid is just an
  // unpaid bill: close it so canceling or changing plans never waits on
  // someone to expire it. Only one they already submitted (money may be on
  // its way) still blocks, and the email match usually clears that on its own.
  await prisma.zellePayment.updateMany({
    where: { paymentPlanId: planId, status: "AWAITING_TRANSFER" },
    data: { status: "EXPIRED" },
  });
  const openPayment = await prisma.zellePayment.findFirst({
    where: { paymentPlanId: planId, status: "PENDING_REVIEW" },
    select: { id: true },
  });
  if (openPayment) {
    throw new PaymentPlanError("Your last payment is still being confirmed. Try again in a few minutes, or message support if it takes longer.");
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
  if (plan.familyGroupId) throw new PaymentPlanError("A family plan's length is changed by the teacher. Message us and we will help.");
  if (plan.term === newTerm) throw new PaymentPlanError("You're already on this term.");

  await assertNoOpenInstallment(plan.id);

  const rate = calculatePaymentPlanRate(plan.cadence, newTerm, await getPricingConfig());
  // The new term's price, then this account's personal discount on top (if the owner gave one).
  const discountPercent = await getDiscountPercent(userId);
  const newInstallmentCents = discountedPlanPriceCents(rate.installmentAmountCents, discountPercent);
  if (plan.installmentsPaid >= rate.termMonths) {
    throw new PaymentPlanError(
      "You've already paid enough installments that this term wouldn't ask for any more. If you want to stop here, cancel your plan instead.",
    );
  }

  await prisma.paymentPlan.update({
    where: { id: plan.id },
    data: {
      term: newTerm,
      installmentAmountCents: newInstallmentCents,
      listAmountCents: discountPercent > 0 ? rate.installmentAmountCents : null,
      creditsPerInstallment: rate.creditsPerInstallment,
      termMonths: rate.termMonths,
    },
  });
  await noticePlanUpdated({
    userId,
    title: "Your plan term changed",
    body: `Your plan is now ${describePaymentPlan(plan.cadence, newTerm)}. Your next installment is ${(newInstallmentCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}.`,
  });
}

/**
 * Self-service reschedule of a Payment Plan subscriber's own standing
 * weekly slot, by direct instruction, the one big piece of Payment Plan
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
 * shape as cancelClassBooking, nothing was ever actually charged against a
 * SCHEDULED-but-not-yet-attended booking) and immediately books the NEW
 * slot's own upcoming occurrences via createReservedBookingIfAbsent, the
 * exact same building block payment-plan-reservations.ts's daily job calls,
 * so a student doesn't wait up to 24h to see their new day/time actually
 * reflected in their upcoming classes.
 */
export async function changeReservedSlot(userId: string, newScheduleId: string, newChunkIndex: number) {
  const { plan, chunk, schedule } = await prisma.$transaction(
    async (tx) => {
      const plan = await tx.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" } });
      if (!plan) throw new PaymentPlanError("You don't have an active payment plan.");
      if (plan.familyGroupId) throw new PaymentPlanError("A family plan's weekly time is moved by the teacher so everyone stays together. Message us and we will help.");
      if (!plan.reservedScheduleId || plan.reservedChunkIndex === null) {
        throw new PaymentPlanError("Your plan doesn't have a reserved slot yet. Message us and we'll help.");
      }
      if (plan.reservedScheduleId === newScheduleId && plan.reservedChunkIndex === newChunkIndex) {
        throw new PaymentPlanError("That's already your weekly time.");
      }

      const schedule = await tx.classSchedule.findUniqueOrThrow({ where: { id: newScheduleId } });
      if (!schedule.active) throw new PaymentPlanError("That class time is no longer offered. Pick another.");
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
      if (reservedByAnother) throw new PaymentPlanError("That slot was just taken. Try again.");

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
        throw new PaymentPlanError("Someone already has a booking on one of this slot's upcoming weeks. Pick another time.");
      }

      // Same cutoff as cancelling a class: a class that starts within the
      // cutoff has to be attended (or sorted out with support), so the standing
      // time cannot be moved out from under it.
      const startingSoon = await tx.classBooking.findFirst({
        where: {
          studentId: userId,
          reservedByPlanId: plan.id,
          status: "SCHEDULED",
          scheduledAt: { gt: new Date(), lt: new Date(Date.now() + CANCELLATION_CUTOFF_HOURS * 3_600_000) },
        },
        select: { id: true },
      });
      if (startingSoon) {
        throw new PaymentPlanError(
          `Your next class starts within ${CANCELLATION_CUTOFF_HOURS} hours, so please attend it or message support. You can change your weekly time after that.`,
        );
      }

      // Frees the old slot right away, same no-charge cancellation as
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
  // daily maintenance job this mirrors, a hiccup on one week doesn't fail
  // the reschedule itself (the plan's new reservedScheduleId/
  // reservedChunkIndex already committed above); the next day's job run
  // would catch up on whatever this loop missed regardless.
  for (const occurrenceDate of nextOccurrenceDates(schedule.dayOfWeek, OCCURRENCES_PER_SLOT)) {
    const scheduledAt = computeScheduledAt(schedule, occurrenceDate, chunk);
    if (scheduledAt.getTime() <= Date.now()) continue;
    // Only classes inside the paid period, same rule as the daily job.
    const paidUntil = plan.status === "COMPLETED" ? addCalendarMonthsClamped(plan.nextDueDate, 1) : plan.nextDueDate;
    if (scheduledAt.getTime() >= paidUntil.getTime()) continue;
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
    body: "Your standing weekly class moved to a new day/time. Check Lessons for your updated schedule.",
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
  if (!Object.values(PlanCancellationReason).includes(reason) || reason === "NON_PAYMENT") {
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

  if (plan.familyGroupId) {
    await notifyAdmins("PLAN_CANCEL_FEEDBACK", {
      type: "ADMIN_ALERT",
      title: "A family plan member canceled",
      body: "One member of a family plan canceled. The other members keep the family rate until you decide what to do. Open Payment Plans to review that family.",
      emailCategory: "social",
      cta: { label: "See the plans", path: "/admin/payment-plans" },
    }).catch((err) => console.error("Family cancel alert failed (non-blocking):", err));
    await afterFamilyPlanEnded(plan);
  }

  const admins = await getAdminRecipients("PLAN_CANCEL_FEEDBACK");
  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: "PLAN_CANCELLATION_FEEDBACK",
        title: "A student canceled their plan",
        body: `${describePaymentPlan(plan.cadence, plan.term)} was self-canceled. See Payment Plans → Feedback for their reason.`,
        emailCategory: "social",
      }),
    ),
  );
}

/**
 * Pauses a running plan for 1 to 4 weeks, starting now. The weekly slot stays theirs; the next payment date and the
 * expiry of this plan's unused credits both move out by the same span, so the pause costs them nothing. Classes
 * inside the pause are canceled with a reason, which the booking jobs read as "do not book this again".
 */
export async function pausePaymentPlan(userId: string, weeks: number): Promise<{ resumesOn: Date }> {
  const now = new Date();
  const plan = await prisma.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" } });
  if (!plan) throw new PaymentPlanError("You don't have an active payment plan.");
  const blocked = pauseBlockedReason(plan, weeks, now);
  if (blocked) throw new PaymentPlanError(blocked);
  await assertNoOpenInstallment(plan.id);

  const span = pauseSpanMs(weeks);
  const resumesOn = new Date(now.getTime() + span);
  await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction: a double click must not push the date twice.
    const claimed = await tx.paymentPlan.updateMany({
      where: { id: plan.id, status: "ACTIVE", nextDueDate: plan.nextDueDate, pausedAt: plan.pausedAt },
      data: { pausedAt: now, pauseUntil: resumesOn, nextDueDate: new Date(plan.nextDueDate.getTime() + span) },
    });
    if (claimed.count !== 1) throw new PaymentPlanError("Your plan just changed. Refresh and try again.");
    const grants = await tx.creditGrant.findMany({
      where: { paymentPlanId: plan.id, expiredAt: null, creditsRemaining: { gt: 0 }, expiresAt: { gt: now } },
      select: { id: true, expiresAt: true },
    });
    for (const g of grants) {
      await tx.creditGrant.update({ where: { id: g.id }, data: { expiresAt: new Date(g.expiresAt!.getTime() + span), expiringSoonNotifiedAt: null } });
    }
    await tx.classBooking.updateMany({
      where: { reservedByPlanId: plan.id, status: "SCHEDULED", scheduledAt: { gt: now, lt: resumesOn } },
      data: { status: "CANCELED", refunded: true, canceledReason: PAUSE_REASON },
    });
  });

  await logAudit({ actorId: userId, action: "plan.pause", targetType: "User", targetId: userId, detail: `Paused for ${weeks} week${weeks === 1 ? "" : "s"}, back on ${resumesOn.toISOString().slice(0, 10)}` }).catch(() => undefined);
  await createNotification({
    userId,
    type: "PAYMENT_PLAN_CANCELED",
    title: "Plan paused",
    body: `Your plan is paused for ${weeks} week${weeks === 1 ? "" : "s"}. Your weekly time is still yours and classes start again on ${resumesOn.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" })}. Your next payment moved back by the same time.`,
    emailCategory: "payments",
  }).catch((err) => console.error("Pause notice failed (non-blocking):", err));
  await notifyAdmins("PLAN_CANCEL_FEEDBACK", {
    type: "ADMIN_ALERT",
    title: "A student paused their plan",
    body: `Paused for ${weeks} week${weeks === 1 ? "" : "s"}. Their slot is held and the next payment moved back.`,
    emailCategory: "social",
    cta: { label: "See the plans", path: "/admin/payment-plans" },
  }).catch((err) => console.error("Pause admin alert failed (non-blocking):", err));
  return { resumesOn };
}

/** Days a plan may sit past due before the system cancels it. */
export const LAPSE_AFTER_DAYS = 7;

/**
 * Cancels a plan that has gone LAPSE_AFTER_DAYS past due with nothing in
 * review: same effects as a self-cancel (open unpaid bill closed, future
 * reserved classes released) with the system as the actor. Returns false
 * when it should not lapse (already settled, or a payment is mid-review).
 */
export async function lapsePlanForNonPayment(planId: string, options: { firstBill?: boolean; quietAdmin?: boolean } = {}): Promise<boolean> {
  const plan = await prisma.paymentPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.status !== "ACTIVE") return false;
  const inReview = await prisma.zellePayment.findFirst({
    where: { OR: [{ paymentPlanId: planId }, ...(plan.familyGroupId && plan.installmentsPaid === 0 ? [{ familyGroupId: plan.familyGroupId }] : [])], status: "PENDING_REVIEW" },
    select: { id: true },
  });
  if (inReview) return false;
  // A family that never started (its combined first payment did not arrive) ends together: no member is left half started.
  const failedFamilyStart = Boolean(plan.familyGroupId) && plan.installmentsPaid === 0;

  await prisma.$transaction(async (tx) => {
    await tx.paymentPlan.update({
      where: { id: planId },
      data: { status: "CANCELED", canceledAt: new Date(), cancellationReason: "NON_PAYMENT" },
    });
    await tx.zellePayment.updateMany({
      where: { OR: [{ paymentPlanId: planId }, ...(failedFamilyStart ? [{ familyGroupId: plan.familyGroupId }] : [])], status: "AWAITING_TRANSFER" },
      data: { status: "EXPIRED" },
    });
    await tx.classBooking.updateMany({
      where: { reservedByPlanId: planId, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
      data: { status: "CANCELED", refunded: true },
    });
  });

  if (failedFamilyStart) {
    const siblings = await prisma.paymentPlan.findMany({
      where: { familyGroupId: plan.familyGroupId, id: { not: planId }, status: "ACTIVE", installmentsPaid: 0 },
      select: { id: true },
    });
    for (const sibling of siblings) await lapsePlanForNonPayment(sibling.id, { firstBill: true, quietAdmin: true });
    // A payer who was switching keeps their current plan; tell them the family did not start.
    const group = await prisma.familyPlanGroup.findUnique({ where: { id: plan.familyGroupId! }, select: { payerId: true, replacesPlanId: true } });
    if (group?.replacesPlanId && group.payerId !== plan.userId) {
      await noticePlanUpdated({
        userId: group.payerId,
        title: "The family plan did not start",
        body: "The combined first payment did not arrive in time, so the family plan was cancelled. Your current plan was not changed.",
      }).catch((err) => console.error("Switch expired notice failed (non-blocking):", err));
    }
  }

  await createNotification({
    userId: plan.userId,
    type: "PAYMENT_PLAN_CANCELED",
    title: "Your plan was canceled",
    body: options.firstBill
      ? "Your first payment did not arrive in time, so your plan was canceled and your weekly time is open to others again. Start a new plan whenever you are ready."
      : "Your payment is a week overdue, so your plan was canceled and your weekly time is open again. Start a new plan to come back.",
    emailCategory: "payments",
  });

  if (options.quietAdmin) return true;
  const student = await prisma.user.findUnique({ where: { id: plan.userId }, select: { name: true, email: true } });
  await notifyAdmins("PLAN_LAPSED", {
    type: "ADMIN_ALERT",
    title: "Plan canceled for non-payment",
    body: failedFamilyStart
      ? `${student?.name ?? student?.email ?? "A family"} and the rest of their family never paid the combined first bill, so every member's plan was canceled and the weekly time is free again.`
      : options.firstBill
      ? `${student?.name ?? student?.email ?? "A student"} never paid their first bill, so their plan was canceled and the weekly time is free again.`
      : `${student?.name ?? student?.email ?? "A student"} went a week past due, so their plan was canceled.`,
    emailCategory: "social",
    cta: { label: "See the plan", path: "/admin/payment-plans?status=CANCELED" },
  });
  if (!failedFamilyStart) await afterFamilyPlanEnded(plan);
  return true;
}

const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** "Mondays 6:30 PM" for a plan's reserved weekly time, or null when it has none. */
export async function describeReservedSlot(planId: string): Promise<string | null> {
  const plan = await prisma.paymentPlan.findUnique({ where: { id: planId }, include: { reservedSchedule: true } });
  if (!plan?.reservedSchedule || plan.reservedChunkIndex === null) return null;
  const chunk = chunksForSchedule(plan.reservedSchedule)[plan.reservedChunkIndex];
  if (!chunk) return null;
  return `${DAY_NAMES[plan.reservedSchedule.dayOfWeek]} ${formatClock(addMinutesToHHmm(plan.reservedSchedule.startTime, chunk.offsetMin))}`;
}

/** The paid month this plan is in: from one billing date to the next. */
function paidMonthOf(plan: { status: PaymentPlanStatus; nextDueDate: Date }): { monthStart: Date; paidUntil: Date } {
  const paidUntil = plan.status === "COMPLETED" ? addCalendarMonthsClamped(plan.nextDueDate, 1) : plan.nextDueDate;
  return { monthStart: addCalendarMonthsClamped(paidUntil, -1), paidUntil };
}

/**
 * How many weekly classes the paid month holds. A month is paid for four classes (creditsPerInstallment / creditsPerClass),
 * but the billing cycle runs from one payment date to the next, so it can hold FIVE of the student's weekday. The
 * subscriber gets every one of their weekdays inside the cycle they paid for: this counts them (never fewer than the four
 * they paid for). A plan with no reserved time keeps the plain four.
 */
export async function classesInPaidMonth(plan: {
  id: string;
  term: PaymentPlanTerm;
  cadence: PaymentPlanCadence;
  status: PaymentPlanStatus;
  nextDueDate: Date;
  creditsPerInstallment: number;
  reservedScheduleId?: string | null;
  reservedChunkIndex?: number | null;
}): Promise<{ allowed: number; base: number }> {
  const base = Math.floor(plan.creditsPerInstallment / PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence]);
  if (!plan.reservedScheduleId || plan.reservedChunkIndex === null || plan.reservedChunkIndex === undefined) return { allowed: base, base };
  const schedule = await prisma.classSchedule.findUnique({ where: { id: plan.reservedScheduleId } });
  const chunk = schedule ? chunksForSchedule(schedule)[plan.reservedChunkIndex] : undefined;
  if (!schedule || !chunk) return { allowed: base, base };
  const { monthStart, paidUntil } = paidMonthOf(plan);
  const inCycle = classesInWindow(schedule, chunk, monthStart, paidUntil);
  // A 3-month or 6-month plan includes every weekday in its cycle. A Monthly plan covers four; it gets the fifth only when it was
  // already given (the free credit went out before this rule, or the student bought the class), so nothing given is taken back.
  if (isCommitmentTerm(plan.term) || (await fifthClassGiven(plan.id, monthStart))) return { allowed: Math.max(base, inCycle), base };
  return { allowed: base, base };
}

/** 3-month and 6-month plans (and the retired yearly one) are commitments; Monthly is not. */
export function isCommitmentTerm(term: PaymentPlanTerm): boolean {
  return term !== "MONTHLY";
}

function fifthClassKey(planId: string, monthStart: Date): string {
  return `plan-fifth-class:${planId}:${monthStart.toISOString().slice(0, 10)}`;
}

async function fifthClassGiven(planId: string, monthStart: Date): Promise<boolean> {
  return Boolean(await prisma.appSetting.findUnique({ where: { key: fifthClassKey(planId, monthStart) }, select: { key: true } }));
}

/**
 * The credit for a fifth class in a paid month. The installment grants four classes' worth; when the cycle holds a fifth of
 * the student's weekday, this adds one class's credit, once per cycle (a marker row makes it safe to call again), good until
 * the next billing date, so the fifth class books and is charged like any other. Returns true when the credit is there.
 */
export async function ensureFifthClassCredit(plan: { id: string; userId: string; status: PaymentPlanStatus; nextDueDate: Date }, creditsPerClass: number): Promise<void> {
  const { monthStart, paidUntil } = paidMonthOf(plan);
  const key = fifthClassKey(plan.id, monthStart);
  try {
    await prisma.appSetting.create({ data: { key, value: "1" } });
  } catch {
    return; // already granted for this paid month
  }
  await grantCredits(plan.userId, creditsPerClass, { source: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, expiresAt: paidUntil });
}

/**
 * For the payment receipt: when the cycle this installment just paid for holds five of the student's weekday, a 3-month or
 * 6-month plan gets the fifth class free (its credit is added now, so the receipt tells the truth), and a Monthly plan is told
 * it can add that class for the owner's price. Null for an ordinary four-class cycle. Never throws.
 */
export async function fifthClassReceiptNote(planId: string): Promise<{ text: string; offerPath: string | null } | null> {
  try {
    const plan = await prisma.paymentPlan.findUnique({ where: { id: planId }, include: { reservedSchedule: true } });
    if (!plan || !plan.reservedSchedule || plan.reservedChunkIndex === null) return null;
    const chunk = chunksForSchedule(plan.reservedSchedule)[plan.reservedChunkIndex];
    if (!chunk) return null;
    const base = Math.floor(plan.creditsPerInstallment / PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence]);
    const { monthStart, paidUntil } = paidMonthOf(plan);
    const starts = classStartsInWindow(plan.reservedSchedule, chunk, monthStart, paidUntil);
    if (starts.length <= base) return null;

    const day = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", ...opts });
    const weekday = day(starts[0], { weekday: "long" });
    const dates = starts.map((d) => day(d, { month: "short", day: "numeric" })).join(", ");
    const lastDay = new Date(paidUntil.getTime() - 86_400_000);
    const cycle = `${day(monthStart, { month: "short", day: "numeric" })} to ${day(lastDay, { month: "short", day: "numeric" })}`;

    if (isCommitmentTerm(plan.term)) {
      await ensureFifthClassCredit(plan, PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence]);
      return {
        text: `A free class: this billing cycle (${cycle}) has ${starts.length} ${weekday}s instead of 4 (${dates}). Because you are on a ${plan.term === "TERM_3" ? "3-month" : plan.term === "TERM_6" ? "6-month" : "long-term"} plan, one extra class credit was added to your account at no charge. All ${starts.length} classes are yours.`,
        offerPath: null,
      };
    }
    if (await fifthClassGiven(plan.id, monthStart)) return null; // the free credit already went out for this cycle
    const price = (await getNumberSetting("payments.fifthClassPriceDollars")) * 100;
    return {
      text: `This billing cycle (${cycle}) has ${starts.length} ${weekday}s instead of 4 (${dates}). Your plan covers 4 classes. You can add the last one for ${formatUsdCents(price)} under Lessons, Extra sessions. It is optional, and nothing changes if you skip it. (3-month and 6-month plans include it free.)`,
      offerPath: "/lessons?tab=extra",
    };
  } catch (err) {
    console.error("Fifth class receipt note failed (non-blocking):", err);
    return null;
  }
}

function formatUsdCents(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}

export interface FifthClassOffer {
  planId: string;
  scheduleId: string;
  chunkIndex: number;
  occurrenceDate: Date;
  scheduledAt: Date;
  priceCents: number;
}

/**
 * The optional fifth class a MONTHLY subscriber can add: their cycle holds five of their weekday, the plan covers four (all
 * booked), the last one is still ahead and unbooked, and it was not already given free. Always worked out here from the
 * plan, never from what the browser sends. Null when there is no offer.
 */
export async function getFifthClassOffer(userId: string): Promise<FifthClassOffer | null> {
  const plan = await prisma.paymentPlan.findFirst({
    where: { userId, term: "MONTHLY", reservedScheduleId: { not: null }, OR: livePaymentPlanConditions() },
    include: { reservedSchedule: true },
  });
  if (!plan || !plan.reservedSchedule || !plan.reservedSchedule.active || plan.reservedChunkIndex === null) return null;
  const chunk = chunksForSchedule(plan.reservedSchedule)[plan.reservedChunkIndex];
  if (!chunk) return null;
  const base = Math.floor(plan.creditsPerInstallment / PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence]);
  const { monthStart, paidUntil } = paidMonthOf(plan);
  const occurrences = classOccurrencesInWindow(plan.reservedSchedule, chunk, monthStart, paidUntil);
  if (occurrences.length <= base) return null;
  if (await fifthClassGiven(plan.id, monthStart)) return null;
  if ((await classesLeftInPaidMonth(plan)) > 0) return null; // the plan's own four are not all booked yet

  const last = occurrences[occurrences.length - 1];
  if (last.scheduledAt.getTime() <= Date.now()) return null;
  const booked = await prisma.classBooking.findFirst({
    where: { studentId: userId, scheduleId: plan.reservedSchedule.id, occurrenceDate: last.occurrenceDate, status: { in: ["SCHEDULED", "COMPLETED"] } },
    select: { id: true },
  });
  if (booked) return null;
  const priceCents = Math.round((await getNumberSetting("payments.fifthClassPriceDollars")) * 100);
  return { planId: plan.id, scheduleId: plan.reservedSchedule.id, chunkIndex: plan.reservedChunkIndex, occurrenceDate: last.occurrenceDate, scheduledAt: last.scheduledAt, priceCents };
}

/** Before a booking: when this would be the fifth class of the paid month, make sure its credit is there. */
export async function topUpIfFifth(
  plan: { id: string; userId: string; term: PaymentPlanTerm; cadence: PaymentPlanCadence; status: PaymentPlanStatus; nextDueDate: Date; creditsPerInstallment: number; reservedScheduleId?: string | null; reservedChunkIndex?: number | null },
  creditsPerClass: number,
): Promise<void> {
  const { monthStart, paidUntil } = paidMonthOf(plan);
  const { allowed, base } = await classesInPaidMonth(plan);
  if (allowed <= base) return;
  const used = await prisma.classBooking.count({
    where: { reservedByPlanId: plan.id, status: { in: ["SCHEDULED", "COMPLETED"] }, scheduledAt: { gte: monthStart, lt: paidUntil } },
  });
  if (used >= base) await ensureFifthClassCredit(plan, creditsPerClass);
}

/**
 * How many more weekly classes this plan may book inside the paid month: every one of the student's weekdays in the cycle
 * they paid for (four or five, see classesInPaidMonth). Classes the student skipped or canceled do not count against it.
 */
export async function classesLeftInPaidMonth(plan: {
  id: string;
  term: PaymentPlanTerm;
  cadence: PaymentPlanCadence;
  status: PaymentPlanStatus;
  nextDueDate: Date;
  creditsPerInstallment: number;
  reservedScheduleId?: string | null;
  reservedChunkIndex?: number | null;
}): Promise<number> {
  const { monthStart, paidUntil } = paidMonthOf(plan);
  const { allowed } = await classesInPaidMonth(plan);
  const used = await prisma.classBooking.count({
    where: {
      reservedByPlanId: plan.id,
      status: { in: ["SCHEDULED", "COMPLETED"] },
      scheduledAt: { gte: monthStart, lt: paidUntil },
    },
  });
  return Math.max(0, allowed - used);
}

/**
 * Books the plan's weekly class for every upcoming week it has paid for, now,
 * instead of waiting for the daily job. Called the moment an installment is
 * approved so the classes show up in the admin's Attendance list right away.
 * Same rules as netlify/functions/payment-plan-reservations.ts: only inside
 * the paid period, only while credits cover the class, skipped classes stay
 * skipped. Never throws.
 */
export async function bookReservedWindowForPlan(planId: string): Promise<void> {
  try {
    const plan = await prisma.paymentPlan.findUnique({ where: { id: planId }, include: { reservedSchedule: true } });
    if (!plan || plan.status === "CANCELED" || !plan.reservedSchedule || plan.reservedChunkIndex === null || !plan.reservedSchedule.active) return;
    const chunk = chunksForSchedule(plan.reservedSchedule)[plan.reservedChunkIndex];
    if (!chunk) return;
    const creditsPerClass = PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence];
    const paidUntil = plan.status === "COMPLETED" ? addCalendarMonthsClamped(plan.nextDueDate, 1) : plan.nextDueDate;

    for (const occurrenceDate of nextOccurrenceDates(plan.reservedSchedule.dayOfWeek, OCCURRENCES_PER_SLOT)) {
      const scheduledAt = computeScheduledAt(plan.reservedSchedule, occurrenceDate, chunk);
      if (scheduledAt.getTime() <= Date.now() || scheduledAt.getTime() >= paidUntil.getTime()) continue;
      if ((await classesLeftInPaidMonth(plan)) <= 0) break;
      await topUpIfFifth(plan, creditsPerClass);
      if ((await getEffectiveClassCredits(plan.userId)) < creditsPerClass) continue;
      await createReservedBookingIfAbsent({
        studentId: plan.userId,
        scheduleId: plan.reservedSchedule.id,
        occurrenceDate,
        scheduledAt,
        creditsSpent: creditsPerClass,
        planId: plan.id,
      }).catch((err) => {
        if ((err as { code?: string })?.code !== "P2002") console.error("Immediate reserved booking failed (non-blocking):", err);
      });
    }
  } catch (err) {
    console.error("bookReservedWindowForPlan failed (non-blocking):", err);
  }
}

let lastCatchUpAt = 0;

/**
 * Books the weekly classes of any live plan that has none on the calendar yet,
 * for example one approved before classes were booked on approval. Cheap and
 * safe to repeat (bookings are existence-checked), so the admin's Attendance
 * feed runs it at most once every 2 minutes instead of waiting for the daily job.
 */
export async function bookMissingReservedWindows(): Promise<void> {
  if (Date.now() - lastCatchUpAt < 2 * 60_000) return;
  lastCatchUpAt = Date.now();
  try {
    const plans = await prisma.paymentPlan.findMany({
      where: {
        reservedScheduleId: { not: null },
        installmentsPaid: { gt: 0 },
        OR: livePaymentPlanConditions(),
        reservedBookings: { none: { status: "SCHEDULED", scheduledAt: { gt: new Date() } } },
      },
      select: { id: true },
    });
    for (const plan of plans) await bookReservedWindowForPlan(plan.id);

    // A month pays for 4 classes. A plan booked before that cap existed may hold
    // a fifth in the same paid month: drop the extra, latest first, and refund it.
    const live = await prisma.paymentPlan.findMany({ where: { reservedScheduleId: { not: null }, OR: livePaymentPlanConditions() } });
    for (const plan of live) {
      const paidUntil = plan.status === "COMPLETED" ? addCalendarMonthsClamped(plan.nextDueDate, 1) : plan.nextDueDate;
      const monthStart = addCalendarMonthsClamped(paidUntil, -1);
      const { allowed } = await classesInPaidMonth(plan);
      const inMonth = await prisma.classBooking.findMany({
        where: { reservedByPlanId: plan.id, status: { in: ["SCHEDULED", "COMPLETED"] }, scheduledAt: { gte: monthStart, lt: paidUntil } },
        orderBy: { scheduledAt: "asc" },
        select: { id: true, status: true, scheduledAt: true },
      });
      const extra = inMonth.slice(allowed).filter((b) => b.status === "SCHEDULED" && b.scheduledAt.getTime() > Date.now());
      if (extra.length > 0) {
        await prisma.classBooking.updateMany({
          where: { id: { in: extra.map((b) => b.id) } },
          data: { status: "CANCELED", refunded: true },
        });
      }
    }
  } catch (err) {
    console.error("bookMissingReservedWindows failed (non-blocking):", err);
  }
}


/**
 * For a subscription whose money the owner already has but the app does not
 * show. Does the right thing for each state, so revenue, access, credits and
 * the booked slot all line up afterwards:
 *  - a payment is already waiting on the plan: approve it (the normal path);
 *  - the plan was already opened but no payment is on record: add the missing
 *    verified payment rows, so revenue counts them, and change nothing else;
 *  - nothing paid at all: log the payment and approve it, which opens access,
 *    grants the credits and books the weekly slot.
 */
export async function recordPlanPaymentReceived(planId: string, adminId: string): Promise<"approved" | "recorded"> {
  const plan = await prisma.paymentPlan.findUniqueOrThrow({
    where: { id: planId },
    include: { installmentPayments: { select: { id: true, status: true } } },
  });
  if (plan.status !== "ACTIVE") throw new Error("Only an active plan can have a payment recorded.");

  const verified = plan.installmentPayments.filter((p) => p.status === "VERIFIED").length;
  const open = plan.installmentPayments.find((p) => p.status === "PENDING_REVIEW" || p.status === "AWAITING_TRANSFER");
  const { approveZellePayment } = await import("@/lib/payments");

  if (open) {
    await prisma.zellePayment.updateMany({
      where: { id: open.id, status: "AWAITING_TRANSFER" },
      data: { status: "PENDING_REVIEW", submittedAt: new Date() },
    });
    await approveZellePayment(open.id, adminId);
    return "approved";
  }

  if (plan.installmentsPaid > verified) {
    for (let n = verified + 1; n <= plan.installmentsPaid; n++) {
      await prisma.zellePayment.create({
        data: {
          userId: plan.userId,
          purpose: "PAYMENT_PLAN_INSTALLMENT",
          paymentPlanId: plan.id,
          installmentNumber: n,
          amountCents: plan.installmentAmountCents,
          lessonQuantity: plan.creditsPerInstallment,
          zelleHandle: "Recorded by owner",
          status: "VERIFIED",
          submittedAt: new Date(),
          reviewedAt: new Date(),
          reviewedById: adminId,
          checkedAt: new Date(),
        },
      });
    }
    return "recorded";
  }

  const created = await prisma.zellePayment.create({
    data: {
      userId: plan.userId,
      purpose: "PAYMENT_PLAN_INSTALLMENT",
      paymentPlanId: plan.id,
      installmentNumber: plan.installmentsPaid + 1,
      amountCents: plan.installmentAmountCents,
      lessonQuantity: plan.creditsPerInstallment,
      zelleHandle: "Recorded by owner",
      status: "PENDING_REVIEW",
      submittedAt: new Date(),
    },
  });
  await approveZellePayment(created.id, adminId);
  return "approved";
}

/**
 * Sends the bill for a plan's open installment again, e.g. when a student says
 * they never got it. Needs a bill to already be open (they open a few days
 * before the due date).
 */
export async function resendPlanInvoice(planId: string): Promise<"sent" | "opted-out"> {
  const { sendPaymentPlanInvoiceEmail, getAppUrl } = await import("@/lib/email");
  const plan = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: planId }, include: { user: { select: { email: true, notifyEmailPayments: true } } } });
  if (plan.status !== "ACTIVE") throw new Error("Only an active plan has a bill to send.");
  const payment = await prisma.zellePayment.findFirst({
    where: { paymentPlanId: planId, status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) throw new Error("No bill is open for this plan yet. It opens a few days before the due date.");
  if (!plan.user.notifyEmailPayments) return "opted-out";

  const now = Date.now();
  const overdueDays = plan.nextDueDate.getTime() < now ? Math.max(1, Math.floor((now - plan.nextDueDate.getTime()) / 86_400_000)) : undefined;
  await sendPaymentPlanInvoiceEmail(plan.user.email, {
    planLabel: describePaymentPlan(plan.cadence, plan.term),
    installmentLabel: `Installment ${payment.installmentNumber ?? plan.installmentsPaid + 1} of ${plan.termMonths}`,
    amountCents: payment.amountCents,
    dueDate: plan.nextDueDate,
    cycleEndsAt: addCalendarMonthsClamped(plan.nextDueDate, 1),
    zelleHandle: payment.zelleHandle,
    cta: { label: "Pay bill", url: getAppUrl("/billing/plans") },
    overdueDays,
    unsubscribe: { userId: plan.userId, category: "payments" },
  });
  return "sent";
}

// ---------------------------------------------------------------------------
// What happens to a family when someone leaves
// ---------------------------------------------------------------------------

/** How many members of a family are paying now (started and still active). */
async function activeFamilySize(groupId: string): Promise<number> {
  return prisma.paymentPlan.count({ where: { familyGroupId: groupId, status: "ACTIVE", installmentsPaid: { gt: 0 } } });
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** A family member left and one person is left: that person pays the solo price from their next bill, and is told now. */
async function noticeFamilyShrank(groupId: string): Promise<void> {
  const remaining = await prisma.paymentPlan.findMany({
    where: { familyGroupId: groupId, status: "ACTIVE", installmentsPaid: { gt: 0 } },
    select: { userId: true, cadence: true, term: true, installmentAmountCents: true },
  });
  if (remaining.length !== 1) return;
  const [last] = remaining;
  const solo = calculatePaymentPlanRate(last.cadence, last.term, await getPricingConfig()).installmentAmountCents;
  await noticePlanUpdated({
    userId: last.userId,
    title: "Your family is down to one person",
    body: `A family plan needs at least two people. From your next bill the price is the solo price, ${money(solo)}, instead of ${money(last.installmentAmountCents)}. Your plan keeps its term and weekly time.`,
  }).catch((err) => console.error("Family shrank notice failed (non-blocking):", err));
}

/**
 * The family's payer left (cancelled, or stopped paying): nobody is left to pay the other members' bills, so the family ends. Each
 * member keeps the month already paid, with its credits and booked classes; no new bills are made.
 */
async function endFamilyWhenPayerLeaves(groupId: string, leavingPlanId: string): Promise<void> {
  const members = await prisma.paymentPlan.findMany({ where: { familyGroupId: groupId, status: "ACTIVE", id: { not: leavingPlanId } }, select: { id: true, userId: true } });
  if (members.length === 0) return;
  for (const member of members) {
    await prisma.$transaction([
      prisma.paymentPlan.update({
        where: { id: member.id },
        data: { status: "CANCELED", canceledAt: new Date(), cancellationReason: "OTHER", cancellationReasonNote: "The family's payer left" },
      }),
      prisma.zellePayment.updateMany({ where: { paymentPlanId: member.id, status: "AWAITING_TRANSFER" }, data: { status: "EXPIRED" } }),
    ]);
    await createNotification({
      userId: member.userId,
      type: "PAYMENT_PLAN_CANCELED",
      title: "Your family plan is ending",
      body: "The person who paid for your family plan left it, so it ends. The month already paid stays: your credits and booked classes run until then. You can start your own plan any time.",
      emailCategory: "payments",
    }).catch((err) => console.error("Family ended notice failed (non-blocking):", err));
  }
  await notifyAdmins("PLAN_CANCEL_FEEDBACK", {
    type: "ADMIN_ALERT",
    title: "A family plan ended: the payer left",
    body: `${members.length} other member${members.length === 1 ? "" : "s"} lost the family plan because the one who paid left. They keep the month already paid.`,
    emailCategory: "social",
    cta: { label: "See the plans", path: "/admin/payment-plans?status=CANCELED" },
  }).catch((err) => console.error("Family ended alert failed (non-blocking):", err));
}

/** Call after any started family plan stops (cancelled by the person, by an admin, or lapsed). */
async function afterFamilyPlanEnded(plan: { id: string; userId: string; familyGroupId: string | null; installmentsPaid: number }): Promise<void> {
  if (!plan.familyGroupId || plan.installmentsPaid < 1) return;
  const group = await prisma.familyPlanGroup.findUnique({ where: { id: plan.familyGroupId }, select: { payerId: true } });
  if (!group) return;
  if (group.payerId === plan.userId) await endFamilyWhenPayerLeaves(plan.familyGroupId, plan.id);
  else await noticeFamilyShrank(plan.familyGroupId);
}

// ---------------------------------------------------------------------------
// Family plans
//
// 2 to MAX_FAMILY_MEMBERS existing accounts, each with its own PaymentPlan at the family rate, all on the same weekly time.
// Everything is created in ONE transaction: if any member cannot start (already on a plan, banned, a name that is not a real
// first and last name, the same person typed twice, the time taken), nothing is created for anyone. The one payer is a member;
// the first month is a single combined FAMILY_PLAN_START payment whose approval starts every member's plan at once
// (startFamilyPlans in payments.ts), so a family can never start with only some members. From month two each member has
// their own bill, and only the payer's account can settle them (see familyPayerOf in paymentEmail.ts).
// ---------------------------------------------------------------------------

export const MIN_FAMILY_MEMBERS = 2;
export const MAX_FAMILY_MEMBERS = 4;

export interface CreateFamilyPlansInput {
  payerId: string;
  cadence: PaymentPlanCadence;
  term: PaymentPlanTerm;
  zelleHandle: string;
  /** Required unless the payer is switching from a plan of their own (then the old plan's weekly time is the default). */
  reservedScheduleId?: string;
  reservedChunkIndex?: number;
  /** The other members' account emails (the payer is added automatically). */
  memberEmails: string[];
  /** Set only by the action that has just checked the payer's password and emailed code. Needed when the payer is on a plan now. */
  verifiedSwitch?: boolean;
}

export async function createFamilyPlans(input: CreateFamilyPlansInput) {
  const { payerId, cadence, term, zelleHandle } = input;
  if (!Object.values(PaymentPlanCadence).includes(cadence)) throw new PaymentPlanError(`"${cadence}" isn't a valid cadence.`);
  if (!Object.values(PaymentPlanTerm).includes(term)) throw new PaymentPlanError(`"${term}" isn't a valid term.`);
  if (!isPlanCadenceOffered(cadence)) throw new PaymentPlanError("That weekly length isn't offered anymore. Classes are 45 minutes a week.");
  if (!isPlanTermOffered(term)) throw new PaymentPlanError("That plan length is no longer offered. Pick Monthly, 3-Month, or 6-Month.");

  const payer = await prisma.user.findUnique({ where: { id: payerId }, select: { id: true, name: true, email: true, role: true, bannedAt: true } });
  if (!payer) throw new PaymentPlanError("Your account was not found.");

  const typed = Array.from(new Set(input.memberEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))).filter((e) => e !== payer.email.toLowerCase());
  if (typed.length + 1 < MIN_FAMILY_MEMBERS) throw new PaymentPlanError(`A family plan needs at least ${MIN_FAMILY_MEMBERS} accounts, you and one more.`);
  if (typed.length + 1 > MAX_FAMILY_MEMBERS) throw new PaymentPlanError(`A family plan can have up to ${MAX_FAMILY_MEMBERS} accounts.`);

  const others = await prisma.user.findMany({ where: { email: { in: typed } }, select: { id: true, name: true, email: true, role: true, bannedAt: true } });
  const missing = typed.filter((email) => !others.some((u) => u.email.toLowerCase() === email));
  if (missing.length > 0) {
    throw new PaymentPlanError(`These emails do not have a Bass Note Piano account yet. Everyone needs to register first: ${missing.join(", ")}`);
  }
  const members = [payer, ...others];
  for (const member of members) {
    const who = member.id === payer.id ? "Your account" : member.email;
    if (member.bannedAt) throw new PaymentPlanError(`${who} cannot start a plan.`);
    if (member.role !== "STUDENT") throw new PaymentPlanError(`${who} is not a student account.`);
    if (!hasFirstAndLastName(member.name)) throw new PaymentPlanError(`${who} needs a first and last name on the account before a family plan can start.`);
  }
  // Each member has to be a different person, not one person with two accounts.
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (namesMatch(members[i].name, members[j].name)) {
        throw new PaymentPlanError(`${members[i].email} and ${members[j].email} have the same name. A family plan is for different people, each with their own account.`);
      }
    }
  }

  // A payer who is already subscribed switches: the old plan keeps running until the family's first payment is approved.
  const oldPlan = await prisma.paymentPlan.findFirst({ where: { userId: payerId, status: "ACTIVE" } });
  if (oldPlan) {
    if (oldPlan.familyGroupId) throw new PaymentPlanError("You are already on a family plan.");
    if (!input.verifiedSwitch) throw new PaymentPlanError("Confirm the switch with your password and the code we email you first.");
    if (oldPlan.installmentsPaid < 1) throw new PaymentPlanError("Pay or cancel your current plan first, then start the family plan.");
    const inReview = await prisma.zellePayment.findFirst({ where: { paymentPlanId: oldPlan.id, status: "PENDING_REVIEW" }, select: { id: true } });
    if (inReview) throw new PaymentPlanError("Your last payment is still being confirmed. Try again in a few minutes.");
  }
  // One family change in a while: stops switching in and out of a family for the discount.
  const cooldownDays = await getNumberSetting("family.changeCooldownDays");
  if (cooldownDays > 0) {
    const recent = await prisma.familyPlanGroup.findFirst({
      where: { payerId, createdAt: { gte: new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000) }, plans: { some: { installmentsPaid: { gt: 0 } } } },
      select: { id: true },
    });
    if (recent) throw new PaymentPlanError(`You started a family plan recently. A family plan can be changed once every ${cooldownDays} days.`);
  }
  const reservedScheduleId = input.reservedScheduleId ?? oldPlan?.reservedScheduleId ?? null;
  const reservedChunkIndex = input.reservedChunkIndex ?? oldPlan?.reservedChunkIndex ?? null;
  if (!reservedScheduleId || reservedChunkIndex === null) throw new PaymentPlanError("Pick the weekly time first.");

  const pricing = await getPricingConfig();
  const perMemberCents = calculateFamilyBundleTotal(cadence, term, members.length, pricing).perStudentMonthlyCents;
  const rate = calculatePaymentPlanRate(cadence, term, pricing);
  const creditsPerWeek = PLAN_CADENCE_CREDITS_PER_WEEK[cadence];
  const memberIds = members.map((m) => m.id);
  // The members who get a plan row now. A switching payer's own plan is created only when the family starts.
  const planMembers = oldPlan ? others : members;

  try {
    const created = await prisma.$transaction(
      async (tx) => {
        // Every other member must be able to start: none may already be on a plan. (A subscribed sibling cancels their own plan first.)
        const busy = await tx.paymentPlan.findFirst({ where: { userId: { in: planMembers.map((m) => m.id) }, status: "ACTIVE" }, select: { userId: true } });
        if (busy) {
          // Another person's plan status is not told to the payer: only that someone cannot start.
          const who = busy.userId === payerId ? "You already have an active payment plan" : "One of the accounts cannot start a family plan right now";
          throw new PaymentPlanError(`${who}. Nobody was signed up. Finish or cancel the plan first, then start the family plan.`);
        }
        if (oldPlan) {
          const still = await tx.paymentPlan.findFirst({ where: { id: oldPlan.id, status: "ACTIVE" }, select: { id: true } });
          if (!still) throw new PaymentPlanError("Your plan changed while we were setting this up. Try again.");
        }
        const payingAlready = await tx.familyPlanGroup.findFirst({ where: { payerId, plans: { some: { status: "ACTIVE" } } }, select: { id: true } });
        if (payingAlready) throw new PaymentPlanError("You already pay for a family plan. One family plan per payer.");

        await assertSlotReservable(tx, reservedScheduleId, reservedChunkIndex, creditsPerWeek, memberIds, oldPlan ? [oldPlan.id] : []);

        const group = await tx.familyPlanGroup.create({ data: { payerId, replacesPlanId: oldPlan?.id ?? null } });
        const plans: PaymentPlan[] = [];
        for (const member of planMembers) {
          plans.push(
            await tx.paymentPlan.create({
              data: {
                userId: member.id,
                cadence,
                term,
                installmentAmountCents: perMemberCents,
                creditsPerInstallment: rate.creditsPerInstallment,
                termMonths: rate.termMonths,
                nextDueDate: new Date(),
                reservedScheduleId,
                reservedChunkIndex,
                familyGroupId: group.id,
              },
            }),
          );
        }
        const startPayment = await tx.zellePayment.create({
          data: {
            userId: payerId,
            purpose: "FAMILY_PLAN_START",
            amountCents: perMemberCents * members.length,
            zelleHandle,
            familyGroupId: group.id,
            status: "AWAITING_TRANSFER",
          },
        });
        return { group, plans, startPayment };
      },
      { isolationLevel: "Serializable" },
    );

    await prisma.user.updateMany({ where: { id: { in: memberIds } }, data: { notifyEmailReminders: true } });
    const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    await noticePlanUpdated({
      userId: payerId,
      title: "Your family plan is set up",
      body: oldPlan
        ? `${describePaymentPlan(cadence, term)} for ${members.length} accounts is ready. Your current plan keeps running until the combined first payment (${money(created.startPayment.amountCents)}, from your own bank account) is approved. Then it is replaced by the family plan, with the same weekly time.`
        : `${describePaymentPlan(cadence, term)} for ${members.length} accounts is set up. Send the combined first payment (${money(created.startPayment.amountCents)}) from your own bank account to start everyone's classes together.`,
    });
    for (const other of others) {
      await noticePlanUpdated({
        userId: other.id,
        title: "You were added to a family plan",
        body: `${payer.name ?? payer.email} set up a family plan that includes you. Your classes start when their first payment arrives, and they pay for your monthly bills.`,
      }).catch((err) => console.error("Family member notice failed (non-blocking):", err));
    }
    return created;
  } catch (err) {
    if (err instanceof PaymentPlanError) throw err;
    if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2034") throw new PaymentPlanError("That slot was just taken. Try again.");
    throw err;
  }
}

/** Who is in a family plan, who pays, and the weekly time, for the screens a member reads. Null for a plan that is not a family's. */
export async function getFamilyDetails(userId: string, plan: { id: string; familyGroupId: string | null } | null) {
  if (!plan?.familyGroupId) return null;
  const group = await prisma.familyPlanGroup.findUnique({
    where: { id: plan.familyGroupId },
    select: {
      payerId: true,
      payer: { select: { name: true, email: true } },
      plans: { where: { status: "ACTIVE" }, select: { userId: true, user: { select: { name: true, email: true } } } },
    },
  });
  if (!group) return null;
  const names = [
    group.payer.name ?? group.payer.email,
    ...group.plans.filter((p) => p.userId !== group.payerId).map((p) => p.user.name ?? p.user.email),
  ];
  return {
    isPayer: group.payerId === userId,
    payerName: group.payer.name ?? group.payer.email,
    memberNames: Array.from(new Set(names)),
    weeklyTime: await describeReservedSlot(plan.id),
  };
}
