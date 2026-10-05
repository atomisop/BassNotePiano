import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
import { ClassBookingClient } from "./ClassBookingClient";
import { ScheduleClient } from "../schedule/ScheduleClient";
import { LessonsHub } from "./LessonsHub";

/**
 * A student on an active Payment Plan sees two tabs here. "My weekly class" is
 * their locked-in time: it is paid by the plan and auto-booked, so there is
 * nothing to buy or book, only a way to move or cancel a single class up to 24
 * hours ahead. "Extra sessions" is the booking calendar, for extra time with the
 * teacher on top of that, paid with credits at $40 each. Everyone else (no
 * active plan, between plans) goes straight to the booking calendar.
 */
export default async function LessonsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  // Booking a class requires curriculum access first — credits themselves
  // already can't be bought without it (see billing/lessons/page.tsx), but
  // this covers anyone who somehow already holds credits without it too.

  const activePlan = await getActivePaymentPlan(session.user.id);

  const [credits, occurrences, bookings, supportContactId] = await Promise.all([
    // Effective, not raw: a credit already reserved by another SCHEDULED
    // booking isn't actually free to spend again, even though the real
    // charge for it hasn't landed yet — see getEffectiveClassCredits.
    getEffectiveClassCredits(session.user.id),
    getUpcomingOccurrences(),
    getUserClassBookings(session.user.id),
    getSupportContactId(),
  ]);

  const bookingClient = (
    <ClassBookingClient
      extraMode={Boolean(activePlan)}
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

  if (!activePlan) return bookingClient;

  const [weeklyUsage, reservedSchedule] = await Promise.all([
    getWeeklyCreditUsage(session.user.id),
    activePlan.reservedScheduleId
      ? prisma.classSchedule.findUnique({ where: { id: activePlan.reservedScheduleId }, select: { dayOfWeek: true, startTime: true } })
      : null,
  ]);

  const now = Date.now();
  const upcomingBookings = bookings
    .filter((b) => b.status === "SCHEDULED" && b.scheduledAt.getTime() > now)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  return (
    <LessonsHub
      initialTab={searchParams.tab === "extra" ? "extra" : "weekly"}
      weekly={
        <ScheduleClient
          supportContactId={supportContactId}
          hasClassThisWeek={weeklyUsage.creditsUsedThisWeek > 0}
          weeklyTime={reservedSchedule}
          upcomingBookings={upcomingBookings.map((b) => ({
            id: b.id,
            label: b.schedule.label,
            scheduledAt: b.scheduledAt.toISOString(),
            creditsSpent: b.creditsSpent,
          }))}
        />
      }
      extras={bookingClient}
    />
  );
}
