import { addBillingCycles } from "@/lib/billingCycle";
import { noticePlanUpdated } from "@/lib/studentNotices";
import { getNumberSetting } from "@/lib/siteSettings";
import { getAdminRecipients, notifyAdmins } from "@/lib/adminNotifications";
import { addMinutesToHHmm } from "@/lib/classScheduleLabels";
import { PaymentPlanCadence, PaymentPlanTerm, PlanCancellationReason, type Prisma, type PaymentPlan, type PaymentPlanStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasFirstAndLastName } from "@/lib/studentName";
import { namesMatch } from "@/lib/personNames";
import { calculateFamilyBundleTotal, calculatePaymentPlanRate, describePaymentPlan, discountedPlanPriceCents, isPlanTermOffered, isPlanCadenceOffered, MIN_FAMILY_MEMBERS, MAX_FAMILY_MEMBERS, PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";
import { assertEveryoneAccepted, FamilyInviteError, spendInvites } from "@/lib/familyInvites";
import { getPricingConfig } from "@/lib/pricing";
import { PRICE_CHANGED_MESSAGE } from "@/lib/planCheckout";
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
import { adminPauseBlockedReason, INDEFINITE_PAUSE_MS, isPausedNow, PAUSE_REASON, pauseBlockedReason, pauseSpanMs } from "@/lib/planPause";
import { logAudit } from "@/lib/audit";

export class PaymentPlanError extends Error {}


/** How many plans one person may start and leave unpaid in a week before they must pay one or wait. Stops holding the best weekly times for free. */
export const MAX_UNPAID_STARTS_PER_WEEK = 3;

async function assertNotHoardingTimes(userId: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [solo, families] = await Promise.all([
    prisma.paymentPlan.count({ where: { userId, familyGroupId: null, installmentsPaid: 0, createdAt: { gte: since } } }),
    prisma.familyPlanGroup.count({ where: { payerId: userId, createdAt: { gte: since }, plans: { none: { installmentsPaid: { gt: 0 } } } } }),
  ]);
  if (solo + families >= MAX_UNPAID_STARTS_PER_WEEK) {
    throw new PaymentPlanError("You have started several plans this week without paying for one. Please pay one of them, or try again in a few days.");
  }
}

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
  /** The first payment the person was shown. If the real price is different now, nothing is created. */
  expectedFirstPaymentCents?: number,
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
    throw new PaymentPlanError("That plan length is no longer offered. Pick 1 Month, 3 Months, or 6 Months.");
  }

  const pricing = await getPricingConfig();
  const rate = calculatePaymentPlanRate(cadence, term, pricing);
  // The owner's personal discount for this account (Admin > Pricing): the plan is created at the discounted price, and the price before
  // it is kept so the discount can be changed or removed later.
  const discountPercent = await getDiscountPercent(userId);
  const installmentCents = discountedPlanPriceCents(rate.installmentAmountCents, discountPercent);
  const creditsPerWeek = PLAN_CADENCE_CREDITS_PER_WEEK[cadence];
  if (expectedFirstPaymentCents !== undefined && expectedFirstPaymentCents !== installmentCents) throw new PaymentPlanError(PRICE_CHANGED_MESSAGE);
  await assertNotHoardingTimes(userId);

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
  if (plan.familyGroupId) throw new PaymentPlanError("A group plan's length is changed by the teacher. Message us and we will help.");
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
export async function changeReservedSlot(userId: string, newScheduleId: string, newChunkIndex: number, options: { byAdmin?: boolean } = {}) {
  const byAdmin = Boolean(options.byAdmin);
  const { plan, chunk, schedule } = await prisma.$transaction(
    async (tx) => {
      const plan = await tx.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" } });
      if (!plan) throw new PaymentPlanError("You don't have an active payment plan.");
      if (plan.familyGroupId && !byAdmin) {
        // A parent-paid plan's child (or their parent, acting for them) can move their own weekly time; a group plan's is moved by the teacher so everyone stays together.
        const kind = (await tx.familyPlanGroup.findUnique({ where: { id: plan.familyGroupId }, select: { kind: true } }))?.kind;
        if (kind !== "PARENT") throw new PaymentPlanError("A group plan's weekly time is moved by the teacher so everyone stays together. Message us and we will help.");
      }
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
      const startingSoon = byAdmin ? null : await tx.classBooking.findFirst({
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
    const paidUntil = plan.status === "COMPLETED" ? addBillingCycles(plan.nextDueDate, 1) : plan.nextDueDate;
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
    body: byAdmin
      ? "The studio moved your standing weekly class to a new day and time, and all your upcoming classes with it. Check Lessons for your updated schedule."
      : "Your standing weekly class moved to a new day/time. Check Lessons for your updated schedule.",
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
  /** A linked parent ending their child's plan (the parent pays for it, so only they or the payer may end it). */
  options: { byParentId?: string } = {},
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
  // A plan a parent pays for is not the child's to cancel: only the parent who pays (or the payer, if it is their own plan) can end it.
  if (plan.familyGroupId) {
    const group = await prisma.familyPlanGroup.findUnique({ where: { id: plan.familyGroupId }, select: { kind: true, payerId: true } });
    if (group?.kind === "PARENT" && group.payerId !== userId && group.payerId !== options.byParentId) {
      throw new PaymentPlanError("Your parent pays for this plan, so they decide when it ends. Ask them to end it from Parent mode.");
    }
  }

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

/**
 * The studio pauses a student's plan (Admin > Billing > Plans, or the student's page): to a chosen date, or indefinitely (`until` null).
 * The weekly time stays theirs. The next bill and the credits' expiry move out by the length of the pause, so nothing falls due or
 * expires while it lasts, classes inside it are canceled and credited back, and an unpaid bill for the old date is closed. An
 * indefinite pause moves them out by a fixed ten years and `adminResumePlan` brings them back by the time actually paused.
 */
export async function adminPausePlan(planId: string, adminId: string, until: Date | null): Promise<{ resumesOn: Date | null }> {
  const now = new Date();
  const plan = await prisma.paymentPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new PaymentPlanError("That plan was not found.");
  const blocked = adminPauseBlockedReason(plan, until, now);
  if (blocked) throw new PaymentPlanError(blocked);
  const inReview = await prisma.zellePayment.findFirst({ where: { paymentPlanId: plan.id, status: "PENDING_REVIEW" }, select: { id: true } });
  if (inReview) throw new PaymentPlanError("A payment for this plan is being reviewed. Settle it first.");

  const span = until ? until.getTime() - now.getTime() : INDEFINITE_PAUSE_MS;
  const pauseUntil = new Date(now.getTime() + span);
  // A bill already overdue is not made worse by waiting: the new date counts from today.
  const base = Math.max(plan.nextDueDate.getTime(), now.getTime());
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.paymentPlan.updateMany({
      where: { id: plan.id, status: "ACTIVE", nextDueDate: plan.nextDueDate, pausedAt: plan.pausedAt },
      data: { pausedAt: now, pauseUntil, nextDueDate: new Date(base + span) },
    });
    if (claimed.count !== 1) throw new PaymentPlanError("This plan just changed. Refresh and try again.");
    await tx.zellePayment.updateMany({ where: { paymentPlanId: plan.id, status: "AWAITING_TRANSFER" }, data: { status: "EXPIRED" } });
    const grants = await tx.creditGrant.findMany({
      where: { paymentPlanId: plan.id, expiredAt: null, creditsRemaining: { gt: 0 }, expiresAt: { gt: now } },
      select: { id: true, expiresAt: true },
    });
    for (const g of grants) {
      await tx.creditGrant.update({ where: { id: g.id }, data: { expiresAt: new Date(g.expiresAt!.getTime() + span), expiringSoonNotifiedAt: null } });
    }
    await tx.classBooking.updateMany({
      where: { reservedByPlanId: plan.id, status: "SCHEDULED", scheduledAt: { gt: now, lt: pauseUntil } },
      data: { status: "CANCELED", refunded: true, canceledReason: PAUSE_REASON },
    });
  });

  const when = until ? `until ${until.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" })}` : "until the studio resumes it";
  await logAudit({ actorId: adminId, action: "plan.pause", targetType: "PaymentPlan", targetId: plan.id, detail: `Studio paused the plan ${when}` }).catch(() => undefined);
  await createNotification({
    userId: plan.userId,
    type: "PAYMENT_PLAN_UPDATED",
    title: "Your plan is paused",
    body: `Your plan is paused ${when}. Your weekly time is still yours, classes stop for now, and your next payment and credits move back by the same time.`,
    emailCategory: "payments",
  }).catch((err) => console.error("Studio pause notice failed (non-blocking):", err));
  return { resumesOn: until };
}

/** Ends a pause now (a date pause early, or an indefinite one): the due date and credits come back to exactly the time left when it began. */
export async function adminResumePlan(planId: string, adminId: string): Promise<void> {
  const now = new Date();
  const plan = await prisma.paymentPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.status !== "ACTIVE") throw new PaymentPlanError("Only a running plan can be resumed.");
  if (!isPausedNow(plan, now) || !plan.pausedAt || !plan.pauseUntil) throw new PaymentPlanError("This plan is not paused.");

  const span = plan.pauseUntil.getTime() - plan.pausedAt.getTime();
  const delta = now.getTime() - plan.pausedAt.getTime() - span; // negative: the pause is cut short
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.paymentPlan.updateMany({
      where: { id: plan.id, status: "ACTIVE", pauseUntil: plan.pauseUntil },
      data: { pauseUntil: now, nextDueDate: new Date(plan.nextDueDate.getTime() + delta) },
    });
    if (claimed.count !== 1) throw new PaymentPlanError("This plan just changed. Refresh and try again.");
    const grants = await tx.creditGrant.findMany({
      where: { paymentPlanId: plan.id, expiredAt: null, creditsRemaining: { gt: 0 }, expiresAt: { gt: now } },
      select: { id: true, expiresAt: true },
    });
    for (const g of grants) {
      await tx.creditGrant.update({ where: { id: g.id }, data: { expiresAt: new Date(g.expiresAt!.getTime() + delta), expiringSoonNotifiedAt: null } });
    }
  });
  await bookReservedWindowForPlan(plan.id);
  await logAudit({ actorId: adminId, action: "plan.resume", targetType: "PaymentPlan", targetId: plan.id, detail: "Studio resumed the plan" }).catch(() => undefined);
  await createNotification({
    userId: plan.userId,
    type: "PAYMENT_PLAN_UPDATED",
    title: "Your plan is back on",
    body: "Your plan is running again. Your weekly classes are back on the calendar and your next payment is due on the new date.",
    emailCategory: "payments",
  }).catch((err) => console.error("Studio resume notice failed (non-blocking):", err));
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

/** The paid cycle this plan is in: from one billing date to the next (28 days, see lib/billingCycle.ts). */
function paidMonthOf(plan: { status: PaymentPlanStatus; nextDueDate: Date }): { monthStart: Date; paidUntil: Date } {
  const paidUntil = plan.status === "COMPLETED" ? addBillingCycles(plan.nextDueDate, 1) : plan.nextDueDate;
  return { monthStart: addBillingCycles(paidUntil, -1), paidUntil };
}

/**
 * How many weekly classes the paid cycle holds: the four it is paid for (creditsPerInstallment / creditsPerClass). Billing cycles
 * are exactly 28 days, so a cycle holds exactly four of any weekday and there is no fifth class to count. The one exception is a
 * fifth class that was already given (a cycle paid for on the old calendar-month billing, marked in AppSetting): it stays honored.
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
  // Only a fifth class that was already given (see above) raises the number; nothing given is ever taken back.
  if (await fifthClassGiven(plan.id, monthStart)) return { allowed: Math.max(base, classesInWindow(schedule, chunk, monthStart, paidUntil)), base };
  return { allowed: base, base };
}

/**
 * The fifth-class offer and its free credit belonged to calendar-month billing, where a cycle held five of a weekday about four times
 * a year. Billing is now 28 days, so they are switched off here (the code stays so a fifth class already given is still honored).
 */
const FIFTH_CLASS_RETIRED = true;

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
  // Retired with the 28-day billing cycle: a cycle never holds five of a weekday, so there is no fifth class to announce or sell.
  if (FIFTH_CLASS_RETIRED) return null;
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
  if (FIFTH_CLASS_RETIRED) return null; // see fifthClassReceiptNote
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
    // A paused plan books nothing until it is resumed.
    if (isPausedNow(plan, new Date())) return;
    const chunk = chunksForSchedule(plan.reservedSchedule)[plan.reservedChunkIndex];
    if (!chunk) return;
    const creditsPerClass = PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence];
    const paidUntil = plan.status === "COMPLETED" ? addBillingCycles(plan.nextDueDate, 1) : plan.nextDueDate;

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
      const paidUntil = plan.status === "COMPLETED" ? addBillingCycles(plan.nextDueDate, 1) : plan.nextDueDate;
      const monthStart = addBillingCycles(paidUntil, -1);
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
    cycleEndsAt: addBillingCycles(plan.nextDueDate, 1),
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
    title: "Your group is down to one person",
    body: `A group plan needs at least two people. From your next bill the price is the solo price, ${money(solo)}, instead of ${money(last.installmentAmountCents)}. Your plan keeps its term and weekly time.`,
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
      title: "Your group plan is ending",
      body: "The person who paid for your group plan left it, so it ends. The 28 days already paid stay: your credits and booked classes run until then. You can start your own plan any time.",
      emailCategory: "payments",
    }).catch((err) => console.error("Family ended notice failed (non-blocking):", err));
  }
  await notifyAdmins("PLAN_CANCEL_FEEDBACK", {
    type: "ADMIN_ALERT",
    title: "A family plan ended: the payer left",
    body: `${members.length} other member${members.length === 1 ? "" : "s"} lost the family plan because the one who paid left. They keep the 28 days already paid.`,
    emailCategory: "social",
    cta: { label: "See the plans", path: "/admin/payment-plans?status=CANCELED" },
  }).catch((err) => console.error("Family ended alert failed (non-blocking):", err));
}

/** Call after any started family plan stops (cancelled by the person, by an admin, or lapsed). */
async function afterFamilyPlanEnded(plan: { id: string; userId: string; familyGroupId: string | null; installmentsPaid: number }): Promise<void> {
  if (!plan.familyGroupId || plan.installmentsPaid < 1) return;
  const group = await prisma.familyPlanGroup.findUnique({ where: { id: plan.familyGroupId }, select: { payerId: true, kind: true } });
  if (!group) return;
  // In parent mode the parent can leave their own plan and the children's plans carry on (the parent still pays them).
  if (group.payerId === plan.userId && group.kind === "FAMILY") await endFamilyWhenPayerLeaves(plan.familyGroupId, plan.id);
  else await noticeFamilyShrank(plan.familyGroupId);
}

// ---------------------------------------------------------------------------
// Family plans
//
// 2 to MAX_FAMILY_MEMBERS (8) existing accounts, each with its own PaymentPlan at the family rate, all on the same weekly time.
// Everything is created in ONE transaction: if any member cannot start (already on a plan, banned, a name that is not a real
// first and last name, the same person typed twice, the time taken), nothing is created for anyone. The one payer is a member;
// the first month is a single combined FAMILY_PLAN_START payment whose approval starts every member's plan at once
// (startFamilyPlans in payments.ts), so a family can never start with only some members. From month two each member has
// their own bill, and only the payer's account can settle them (see familyPayerOf in paymentEmail.ts).
// ---------------------------------------------------------------------------

export { MIN_FAMILY_MEMBERS, MAX_FAMILY_MEMBERS };

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
  /** The first payment (everyone together) the payer was shown. If the real price is different now, nothing is created. */
  expectedFirstPaymentCents?: number;
  /** Set only by the action that has just checked the payer's password and emailed code. Needed when the payer is on a plan now. */
  verifiedSwitch?: boolean;
}

export async function createFamilyPlans(input: CreateFamilyPlansInput) {
  const { payerId, cadence, term, zelleHandle } = input;
  if (!Object.values(PaymentPlanCadence).includes(cadence)) throw new PaymentPlanError(`"${cadence}" isn't a valid cadence.`);
  if (!Object.values(PaymentPlanTerm).includes(term)) throw new PaymentPlanError(`"${term}" isn't a valid term.`);
  if (!isPlanCadenceOffered(cadence)) throw new PaymentPlanError("That weekly length isn't offered anymore. Classes are 45 minutes a week.");
  if (!isPlanTermOffered(term)) throw new PaymentPlanError("That plan length is no longer offered. Pick 1 Month, 3 Months, or 6 Months.");

  const payer = await prisma.user.findUnique({ where: { id: payerId }, select: { id: true, name: true, email: true, role: true, bannedAt: true } });
  if (!payer) throw new PaymentPlanError("Your account was not found.");

  const typed = Array.from(new Set(input.memberEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))).filter((e) => e !== payer.email.toLowerCase());
  if (typed.length + 1 < MIN_FAMILY_MEMBERS) throw new PaymentPlanError(`A group plan needs at least ${MIN_FAMILY_MEMBERS} accounts, you and one more.`);
  if (typed.length + 1 > MAX_FAMILY_MEMBERS) throw new PaymentPlanError(`A group plan can have up to ${MAX_FAMILY_MEMBERS} accounts.`);

  const others = await prisma.user.findMany({ where: { email: { in: typed } }, select: { id: true, name: true, email: true, role: true, bannedAt: true } });
  const missing = typed.filter((email) => !others.some((u) => u.email.toLowerCase() === email));
  if (missing.length > 0) {
    throw new PaymentPlanError(`These emails do not have a Bass Note Piano account yet. Everyone needs to register first: ${missing.join(", ")}`);
  }
  const members = [payer, ...others];
  for (const member of members) {
    const who = member.id === payer.id ? "Your account" : member.email;
    if (member.bannedAt || member.role !== "STUDENT") throw new PaymentPlanError(`${who} cannot start a plan.`);
    if (!hasFirstAndLastName(member.name)) throw new PaymentPlanError(`${who} needs a first and last name on the account before a group plan can start.`);
  }
  // Each member has to be a different person, not one person with two accounts.
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (namesMatch(members[i].name, members[j].name)) {
        throw new PaymentPlanError(`${members[i].email} and ${members[j].email} have the same name. A group plan is for different people, each with their own account.`);
      }
    }
  }

  // A payer who is already subscribed switches: the old plan keeps running until the family's first payment is approved.
  const oldPlan = await prisma.paymentPlan.findFirst({ where: { userId: payerId, status: "ACTIVE" } });
  if (oldPlan) {
    if (oldPlan.familyGroupId) throw new PaymentPlanError("You are already on a group plan.");
    if (!input.verifiedSwitch) throw new PaymentPlanError("Confirm the switch with your password and the code we email you first.");
    if (oldPlan.installmentsPaid < 1) throw new PaymentPlanError("Pay or cancel your current plan first, then start the group plan.");
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
    if (recent) throw new PaymentPlanError(`You started a group plan recently. A group plan can be changed once every ${cooldownDays} days.`);
  }
  // The weekly time is the PAYER's own. Everyone else in the family gets credits and books their own class times with them.
  // A payer switching in from a plan keeps the weekly time that plan already holds.
  const reservedScheduleId = oldPlan ? oldPlan.reservedScheduleId : (input.reservedScheduleId ?? null);
  const reservedChunkIndex = oldPlan ? oldPlan.reservedChunkIndex : (input.reservedChunkIndex ?? null);
  if (!reservedScheduleId || reservedChunkIndex === null) throw new PaymentPlanError("Pick the weekly time first.");

  const pricing = await getPricingConfig();
  const perMemberCents = calculateFamilyBundleTotal(cadence, term, members.length, pricing).perStudentMonthlyCents;
  if (input.expectedFirstPaymentCents !== undefined && input.expectedFirstPaymentCents !== perMemberCents * members.length) throw new PaymentPlanError(PRICE_CHANGED_MESSAGE);
  await assertNotHoardingTimes(payerId);
  const rate = calculatePaymentPlanRate(cadence, term, pricing);
  const creditsPerWeek = PLAN_CADENCE_CREDITS_PER_WEEK[cadence];
  const memberIds = members.map((m) => m.id);
  // The members who get a plan row now. A switching payer's own plan is created only when the family starts.
  const planMembers = oldPlan ? others : members;

  try {
    const created = await prisma.$transaction(
      async (tx) => {
        // Nobody is put on a family without saying yes: every other member must have accepted this payer's invitation.
        try {
          await assertEveryoneAccepted(tx, payerId, others);
        } catch (err) {
          if (err instanceof FamilyInviteError) throw new PaymentPlanError(err.message);
          throw err;
        }
        // Every other member must be able to start: none may already be on a plan. (A subscribed sibling cancels their own plan first.)
        const busy = await tx.paymentPlan.findFirst({ where: { userId: { in: planMembers.map((m) => m.id) }, status: "ACTIVE" }, select: { userId: true } });
        if (busy) {
          // Another person's plan status is not told to the payer: only that someone cannot start.
          const who = busy.userId === payerId ? "You already have an active payment plan" : "One of the accounts cannot start a family plan right now";
          throw new PaymentPlanError(`${who}. Nobody was signed up. Finish or cancel the plan first, then start the group plan.`);
        }
        if (oldPlan) {
          const still = await tx.paymentPlan.findFirst({ where: { id: oldPlan.id, status: "ACTIVE" }, select: { id: true } });
          if (!still) throw new PaymentPlanError("Your plan changed while we were setting this up. Try again.");
        }
        const payingAlready = await tx.familyPlanGroup.findFirst({ where: { payerId, plans: { some: { status: "ACTIVE" } } }, select: { id: true } });
        if (payingAlready) throw new PaymentPlanError("You already pay for a group plan. One group plan per payer.");

        await assertSlotReservable(tx, reservedScheduleId, reservedChunkIndex, creditsPerWeek, [payerId], oldPlan ? [oldPlan.id] : []);

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
                // Only the payer's plan holds a weekly time; the others book their own classes with their credits.
                reservedScheduleId: member.id === payerId ? reservedScheduleId : null,
                reservedChunkIndex: member.id === payerId ? reservedChunkIndex : null,
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
        await spendInvites(tx, payerId, others.map((o) => o.id));
        return { group, plans, startPayment };
      },
      { isolationLevel: "Serializable" },
    );

    await prisma.user.updateMany({ where: { id: { in: memberIds } }, data: { notifyEmailReminders: true } });
    const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    await noticePlanUpdated({
      userId: payerId,
      title: "Your group plan is set up",
      body: oldPlan
        ? `${describePaymentPlan(cadence, term)} for ${members.length} accounts is ready. Your current plan keeps running until the combined first payment (${money(created.startPayment.amountCents)}, from your own bank account) is approved. Then it is replaced by the group plan, with the same weekly time.`
        : `${describePaymentPlan(cadence, term)} for ${members.length} accounts is set up. Send the combined first payment (${money(created.startPayment.amountCents)}) from your own bank account to start everyone's classes together.`,
    });
    for (const other of others) {
      await noticePlanUpdated({
        userId: other.id,
        title: "You were added to a group plan",
        body: `${payer.name ?? payer.email} set up a group plan that includes you. When their first payment arrives, class credits go on your account and you pick your own class times. They pay your 28-day bills. Credits expire at the end of each 28-day cycle, so book before then.`,
      }).catch((err) => console.error("Family member notice failed (non-blocking):", err));
    }
    return created;
  } catch (err) {
    if (err instanceof PaymentPlanError) throw err;
    if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2034") throw new PaymentPlanError("That slot was just taken. Try again.");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Parent mode: a parent pays for the children they are linked to (see parentLinks.ts)
//
// Each child gets their own PaymentPlan, all started together by ONE combined payment from the parent's own bank account (the same
// FAMILY_PLAN_START payment a group plan uses, on a group of kind PARENT). The parent is a member only if they choose to learn too
// ("I'm learning too", allowed while they have no plan of their own); they are never forced into a plan to pay for a child, and leaving
// their own plan never ends the children's. The weekly time goes to the first child; the others (and the parent) book with credits.
// One child is priced like a solo plan; two or more people get the group rate.
// ---------------------------------------------------------------------------

export interface CreateParentPlansInput {
  payerId: string;
  cadence: PaymentPlanCadence;
  term: PaymentPlanTerm;
  zelleHandle: string;
  reservedScheduleId: string;
  reservedChunkIndex: number;
  /** The linked children's account emails. The first one holds the weekly time. */
  childEmails: string[];
  /** The parent learns too, on a plan of their own at the same price. Needs the parent to have no active plan. */
  includeSelf: boolean;
  expectedFirstPaymentCents?: number;
}

/** What one person pays per 28 days when `people` are on a parent-paid plan: solo price for one, the group rate for two or more. */
export function parentPlanPerPersonCents(cadence: PaymentPlanCadence, term: PaymentPlanTerm, people: number, pricing: Awaited<ReturnType<typeof getPricingConfig>>): number {
  return people >= 2 ? calculateFamilyBundleTotal(cadence, term, people, pricing).perStudentMonthlyCents : calculatePaymentPlanRate(cadence, term, pricing).installmentAmountCents;
}

export async function createParentPlans(input: CreateParentPlansInput) {
  const { payerId, cadence, term, zelleHandle, includeSelf } = input;
  if (!Object.values(PaymentPlanCadence).includes(cadence)) throw new PaymentPlanError(`"${cadence}" isn't a valid cadence.`);
  if (!Object.values(PaymentPlanTerm).includes(term)) throw new PaymentPlanError(`"${term}" isn't a valid term.`);
  if (!isPlanCadenceOffered(cadence)) throw new PaymentPlanError("That weekly length isn't offered anymore. Classes are 45 minutes a week.");
  if (!isPlanTermOffered(term)) throw new PaymentPlanError("That plan length is no longer offered. Pick 1 Month, 3 Months, or 6 Months.");

  const payer = await prisma.user.findUnique({ where: { id: payerId }, select: { id: true, name: true, email: true, role: true, bannedAt: true } });
  if (!payer || payer.bannedAt || payer.role !== "STUDENT") throw new PaymentPlanError("Your account cannot start a plan.");
  if (includeSelf && !hasFirstAndLastName(payer.name)) throw new PaymentPlanError("Your account needs a first and last name on it before you can be on a plan.");

  const typed = Array.from(new Set(input.childEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))).filter((e) => e !== payer.email.toLowerCase());
  if (typed.length < 1) throw new PaymentPlanError("Add at least one child's account.");
  const people = typed.length + (includeSelf ? 1 : 0);
  if (people > MAX_FAMILY_MEMBERS) throw new PaymentPlanError(`A plan can have up to ${MAX_FAMILY_MEMBERS} accounts.`);

  const kids = await prisma.user.findMany({ where: { email: { in: typed } }, select: { id: true, name: true, email: true, role: true, bannedAt: true } });
  const missing = typed.filter((email) => !kids.some((u) => u.email.toLowerCase() === email));
  if (missing.length > 0) throw new PaymentPlanError(`These emails do not have a Bass Note Piano account yet: ${missing.join(", ")}`);
  // Children first, in the order typed, so the first one holds the weekly time.
  const orderedKids = typed.map((email) => kids.find((k) => k.email.toLowerCase() === email)!);
  for (const kid of orderedKids) {
    if (kid.bannedAt || kid.role !== "STUDENT") throw new PaymentPlanError(`${kid.email} cannot start a plan.`);
    if (!hasFirstAndLastName(kid.name)) throw new PaymentPlanError(`${kid.email} needs a first and last name on the account before a plan can start.`);
  }
  const members = includeSelf ? [...orderedKids, payer] : orderedKids;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (namesMatch(members[i].name, members[j].name)) {
        throw new PaymentPlanError(`${members[i].email} and ${members[j].email} have the same name. Each person needs their own account.`);
      }
    }
  }

  const holder = orderedKids[0];
  const pricing = await getPricingConfig();
  const perMemberCents = parentPlanPerPersonCents(cadence, term, members.length, pricing);
  if (input.expectedFirstPaymentCents !== undefined && input.expectedFirstPaymentCents !== perMemberCents * members.length) throw new PaymentPlanError(PRICE_CHANGED_MESSAGE);
  await assertNotHoardingTimes(payerId);
  const rate = calculatePaymentPlanRate(cadence, term, pricing);
  const creditsPerWeek = PLAN_CADENCE_CREDITS_PER_WEEK[cadence];

  try {
    const created = await prisma.$transaction(
      async (tx) => {
        // Every child must be linked to this parent, and have said yes.
        const links = await tx.parentLink.findMany({ where: { parentId: payerId, childId: { in: orderedKids.map((k) => k.id) }, status: "ACCEPTED" }, select: { childId: true } });
        const linked = new Set(links.map((l) => l.childId));
        const notLinked = orderedKids.filter((k) => !linked.has(k.id));
        if (notLinked.length > 0) throw new PaymentPlanError(`${notLinked.map((k) => k.email).join(", ")} ${notLinked.length === 1 ? "is" : "are"} not linked to you yet. Ask them to accept your request first.`);

        // Nobody may already be on a plan. A child's plan status is not told to the parent: only that someone cannot start.
        const busyKid = await tx.paymentPlan.findFirst({ where: { userId: { in: orderedKids.map((k) => k.id) }, status: "ACTIVE" }, select: { userId: true } });
        if (busyKid) throw new PaymentPlanError("One of the accounts cannot start a plan right now. Nobody was signed up. Finish or cancel their plan first.");
        if (includeSelf) {
          const mine = await tx.paymentPlan.findFirst({ where: { userId: payerId, status: "ACTIVE" }, select: { id: true } });
          if (mine) throw new PaymentPlanError("You already have your own plan. Turn off \"I'm learning too\", or cancel your plan first.");
        }
        await assertSlotReservable(tx, input.reservedScheduleId, input.reservedChunkIndex, creditsPerWeek, [], []);

        const group = await tx.familyPlanGroup.create({ data: { payerId, kind: "PARENT" } });
        const plans: PaymentPlan[] = [];
        for (const member of members) {
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
                reservedScheduleId: member.id === holder.id ? input.reservedScheduleId : null,
                reservedChunkIndex: member.id === holder.id ? input.reservedChunkIndex : null,
                familyGroupId: group.id,
              },
            }),
          );
        }
        const startPayment = await tx.zellePayment.create({
          data: { userId: payerId, purpose: "FAMILY_PLAN_START", amountCents: perMemberCents * members.length, zelleHandle, familyGroupId: group.id, status: "AWAITING_TRANSFER" },
        });
        return { group, plans, startPayment };
      },
      { isolationLevel: "Serializable" },
    );

    await prisma.user.updateMany({ where: { id: { in: members.map((m) => m.id) } }, data: { notifyEmailReminders: true } });
    const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    await noticePlanUpdated({
      userId: payerId,
      title: "Your plan is set up",
      body: `${describePaymentPlan(cadence, term)} for ${members.length === 1 ? holder.name ?? holder.email : `${members.length} accounts`} is set up. Send the first payment (${money(created.startPayment.amountCents)}) from your own bank account to start the classes. You pay every 28-day bill from the Parent mode page.`,
    });
    for (const kid of orderedKids) {
      await noticePlanUpdated({
        userId: kid.id,
        title: "A plan was set up for you",
        body: `${payer.name ?? payer.email} set up your plan. When their first payment arrives your class credits appear${kid.id === holder.id ? " and your weekly class is booked" : ""}. They pay your bills, and they can see your progress and help with your class times.`,
      }).catch((err) => console.error("Parent plan child notice failed (non-blocking):", err));
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
