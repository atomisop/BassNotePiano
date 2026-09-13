import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import {
  getEffectiveClassCredits,
  getUpcomingOccurrences,
  getUserClassBookings,
  getWeeklyCreditUsage,
  CANCELLATION_CUTOFF_HOURS,
  SOLO_MAX_CREDITS,
  FAMILY_MIN_ATTENDEES,
  FAMILY_CREDITS_PER_STUDENT,
} from "@/lib/classSchedule";
import { getActivePaymentPlan } from "@/lib/paymentPlans";
import { getSupportContactId } from "@/lib/admin";
import { EXTRA_SESSION_FLAT_PRICE_CENTS } from "@/lib/classCreditPricing";
import { ClassBookingClient } from "./ClassBookingClient";
import { ScheduleClient } from "../schedule/ScheduleClient";

/**
 * A student on an active Payment Plan doesn't get sent away from here
 * (they used to get redirected to /schedule, which reads as "you're
 * blocked from this tab" even though nothing about their access changed).
 * They're not blocked from Lessons, they're blocked from self-service
 * *editing* of a schedule they already paid for and locked in. This page
 * still shows them their week, right here: usage, upcoming classes, and a
 * guided way to add an extra session. bookClass itself still refuses their
 * ad hoc self-booking either way (see its own comment in classSchedule.ts),
 * that restriction was never about this page, only the old open calendar.
 *
 * Everyone else (no active plan, historical Family Bundle credits, between
 * plans) keeps the full open booking calendar exactly as before.
 */
export default async function LessonsPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  // Booking a class requires curriculum access first — credits themselves
  // already can't be bought without it (see billing/lessons/page.tsx), but
  // this covers anyone who somehow already holds credits without it too.
  if (!session.user.hasCurriculumAccess) redirect("/billing/curriculum?next=lessons");

  const activePlan = await getActivePaymentPlan(session.user.id);

  if (activePlan) {
    const [credits, weeklyUsage, occurrences, bookings, supportContactId] = await Promise.all([
      getEffectiveClassCredits(session.user.id),
      getWeeklyCreditUsage(session.user.id),
      getUpcomingOccurrences(),
      getUserClassBookings(session.user.id),
      getSupportContactId(),
    ]);

    const now = Date.now();
    const upcomingBookings = bookings
      .filter((b) => b.status === "SCHEDULED" && b.scheduledAt.getTime() > now)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

    // Single-credit only: EXTRA_SESSION_FLAT_PRICE_CENTS is a flat rate for
    // exactly one 30-min session, so a 2-credit chunk is left out here
    // rather than shown as something this button can't actually buy.
    const openSlots = occurrences.filter((o) => !o.isBooked && o.creditCost === 1).slice(0, 6);

    return (
      <ScheduleClient
        zelleHandle={process.env.ZELLE_HANDLE ?? "payments@yourplatform.com"}
        credits={credits}
        creditsUsedThisWeek={weeklyUsage.creditsUsedThisWeek}
        weeklyAllotment={weeklyUsage.weeklyAllotment}
        supportContactId={supportContactId}
        extraSessionPriceCents={EXTRA_SESSION_FLAT_PRICE_CENTS}
        upcomingBookings={upcomingBookings.map((b) => ({
          id: b.id,
          label: b.schedule.label,
          scheduledAt: b.scheduledAt.toISOString(),
          creditsSpent: b.creditsSpent,
        }))}
        openSlots={openSlots.map((o) => ({
          scheduleId: o.scheduleId,
          occurrenceDateMs: o.occurrenceDate.getTime(),
          chunkIndex: o.chunkIndex,
          label: o.label,
          scheduledAt: o.scheduledAt.toISOString(),
        }))}
      />
    );
  }

  const [credits, occurrences, bookings, supportContactId] = await Promise.all([
    // Effective, not raw: a credit already reserved by another SCHEDULED
    // booking isn't actually free to spend again, even though the real
    // charge for it hasn't landed yet — see getEffectiveClassCredits.
    getEffectiveClassCredits(session.user.id),
    getUpcomingOccurrences(),
    getUserClassBookings(session.user.id),
    getSupportContactId(),
  ]);

  return (
    <ClassBookingClient
      initialCredits={credits}
      cancellationCutoffHours={CANCELLATION_CUTOFF_HOURS}
      soloMaxCredits={SOLO_MAX_CREDITS}
      familyMinAttendees={FAMILY_MIN_ATTENDEES}
      familyCreditsPerStudent={FAMILY_CREDITS_PER_STUDENT}
      supportContactId={supportContactId}
      occurrences={occurrences.map((o) => ({
        scheduleId: o.scheduleId,
        label: o.label,
        dayOfWeek: o.dayOfWeek,
        chunkIndex: o.chunkIndex,
        durationMin: o.durationMin,
        creditCost: o.creditCost,
        occurrenceDateMs: o.occurrenceDate.getTime(),
        scheduledAt: o.scheduledAt.toISOString(),
        isBooked: o.isBooked,
      }))}
      initialBookings={bookings.map((b) => ({
        id: b.id,
        label: b.schedule.label,
        scheduledAt: b.scheduledAt.toISOString(),
        creditsSpent: b.creditsSpent,
        status: b.status,
        refunded: b.refunded,
        attendance: b.attendance,
        canceledReason: b.canceledReason,
      }))}
    />
  );
}
