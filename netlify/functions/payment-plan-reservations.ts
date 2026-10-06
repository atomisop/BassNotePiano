import type { Prisma } from "@prisma/client";
import { schedule } from "@netlify/functions";
import { prisma } from "../../src/lib/prisma";
import { createNotification } from "../../src/lib/notifications";
import { notifyAdmins } from "../../src/lib/adminNotifications";
import { PLAN_CADENCE_CREDITS_PER_WEEK } from "../../src/lib/classCreditPricing";
import { addCalendarMonthsClamped, classesLeftInPaidMonth } from "../../src/lib/paymentPlans";
import {
  OCCURRENCES_PER_SLOT,
  chunksForSchedule,
  nextOccurrenceDates,
  computeScheduledAt,
  getEffectiveClassCredits,
  createReservedBookingIfAbsent,
  livePaymentPlanConditions,
} from "../../src/lib/classSchedule";

// Runs daily at 09:30 UTC, shortly after credit-expiry.ts (09:00) so a plan
// whose last cycle just lapsed is already excluded from "live" by the time
// this runs. Keeps a rolling OCCURRENCES_PER_SLOT-week window of real
// ClassBooking rows booked for every Payment Plan's own reserved slot —
// not just "next week": the whole displayed booking horizon, so nothing in
// it is ever stranger-bookable. Existence-based per occurrence (checked via
// createReservedBookingIfAbsent), so a missed run just means the window
// catches back up on the next one, nothing is lost.
export const handler = schedule("30 9 * * *", async () => {
  const plans = await prisma.paymentPlan.findMany({
    where: { reservedScheduleId: { not: null }, OR: livePaymentPlanConditions() },
    include: { reservedSchedule: true },
  });

  let booked = 0;
  let skippedInsufficientCredits = 0;
  let notifiedInactive = 0;

  // Sequential across plans and across each plan's own occurrences, not
  // parallel — a later credit-sufficiency check needs to see bookings this
  // same run already made (getEffectiveClassCredits reads real, committed
  // ClassBooking rows). Low volume by construction (one reservation per
  // plan, a handful of plans), so this isn't a performance concern.
  for (const plan of plans) {
    const reservedSchedule = plan.reservedSchedule;
    if (!reservedSchedule || plan.reservedChunkIndex === null) continue; // the two are always set together at enrollment; defensive only

    if (!reservedSchedule.active) {
      if (!plan.reservedSlotInactiveNotifiedAt) {
        const now = new Date();
        await createNotification({
          userId: plan.userId,
          type: "RESERVED_SLOT_UNAVAILABLE",
          title: "Your reserved class time isn't offered anymore",
          body: "The weekly time your payment plan reserves was deactivated. Message us and we'll help you pick a new one.",
          emailCategory: "payments",
        }).catch((err) => console.error(`RESERVED_SLOT_UNAVAILABLE notification failed for plan ${plan.id} (non-blocking):`, err));
        await prisma.paymentPlan.update({ where: { id: plan.id }, data: { reservedSlotInactiveNotifiedAt: now } });
        notifiedInactive++;
      }
      continue; // no booking while the underlying schedule is off
    }

    // Reactivated after a prior deactivation — clear the guard so a future
    // deactivation can notify again.
    if (plan.reservedSlotInactiveNotifiedAt) {
      await prisma.paymentPlan.update({ where: { id: plan.id }, data: { reservedSlotInactiveNotifiedAt: null } });
    }

    const chunk = chunksForSchedule(reservedSchedule)[plan.reservedChunkIndex];
    if (!chunk) {
      // The reserved time no longer exists (for example a short leftover slot dropped when classes became 45 minutes).
      // Tell the admins once, instead of silently never booking this student.
      if (!plan.reservedSlotInactiveNotifiedAt) {
        const student = await prisma.user.findUnique({ where: { id: plan.userId }, select: { name: true, email: true } });
        await notifyAdmins("SLOT_PROBLEM", {
          type: "ADMIN_ALERT",
          title: "A weekly time no longer exists",
          body: `${student?.name ?? student?.email ?? "A subscriber"} has a weekly time that is gone, so their classes are not being booked. Pick them a new time.`,
          emailCategory: "social",
        });
        await prisma.paymentPlan.update({ where: { id: plan.id }, data: { reservedSlotInactiveNotifiedAt: new Date() } });
      }
      continue;
    }

    // What the plan itself pays for each week: 1 credit for a 30-minute plan,
    // 2 for a 60-minute one. NOT chunk.creditCost, which is the whole time
    // block's size (2 credits) and used to be charged to every plan, so a
    // 30-minute subscriber (4 credits a month) ran out after two weeks.
    const creditsPerClass = PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence];
    const paidUntil = plan.status === "COMPLETED" ? addCalendarMonthsClamped(plan.nextDueDate, 1) : plan.nextDueDate;

    // Self-heal: upcoming, not-yet-attended classes this plan already booked
    // at the old (too high) price are brought down to the plan's own rate.
    // Only future SCHEDULED rows of this plan's own reservation are touched.
    await prisma.classBooking.updateMany({
      where: {
        reservedByPlanId: plan.id,
        status: "SCHEDULED",
        scheduledAt: { gt: new Date() },
        creditsSpent: { not: creditsPerClass },
      },
      data: { creditsSpent: creditsPerClass },
    });

    for (const occurrenceDate of nextOccurrenceDates(reservedSchedule.dayOfWeek, OCCURRENCES_PER_SLOT)) {
      const scheduledAt = computeScheduledAt(reservedSchedule, occurrenceDate, chunk);
      if (scheduledAt.getTime() <= Date.now()) continue; // already started/passed
      // Only classes inside the period already paid for (the same "paid until"
      // rule entitlement.ts uses: a COMPLETED plan's last installment does not
      // advance nextDueDate, so its paid period runs one month past it).
      // Without this, credits a student bought for extra sessions could be used
      // up by this job to book their weekly slot for weeks not yet paid for.
      if (scheduledAt.getTime() >= paidUntil.getTime()) continue;

      // A paid month is 4 classes even when it holds five of this weekday.
      if ((await classesLeftInPaidMonth(plan)) <= 0) break;

      const available = await getEffectiveClassCredits(plan.userId);
      if (available < creditsPerClass) {
        // Not enough left for this week yet — skip rather than book, the
        // one thing keeping User.classCredits from ever going negative
        // (markAttendance decrements unconditionally, with no floor guard).
        // Also correctly handles a 5-occurrence month when only 4 weeks
        // were paid for.
        skippedInsufficientCredits++;
        continue;
      }

      try {
        const result = await createReservedBookingIfAbsent({
          studentId: plan.userId,
          scheduleId: reservedSchedule.id,
          occurrenceDate,
          scheduledAt,
          creditsSpent: creditsPerClass,
          planId: plan.id,
        });
        if (result) booked++;
      } catch (err) {
        if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
          continue; // a manual booking (or a concurrent run) won this exact occurrence first — benign
        }
        console.error(`Reserved booking failed for plan ${plan.id}, occurrence ${occurrenceDate.toISOString()} (non-blocking):`, err);
      }
    }
  }

  console.log(
    `Payment plan reservations: processed ${plans.length} plan(s), booked ${booked} occurrence(s), skipped ${skippedInsufficientCredits} for insufficient credits, notified ${notifiedInactive} inactive-schedule plan(s).`,
  );
  return { statusCode: 200 };
});
