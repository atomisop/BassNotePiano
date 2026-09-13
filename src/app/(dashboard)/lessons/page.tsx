import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import {
  getEffectiveClassCredits,
  getUpcomingOccurrences,
  getUserClassBookings,
  CANCELLATION_CUTOFF_HOURS,
  SOLO_MAX_CREDITS,
  FAMILY_MIN_ATTENDEES,
  FAMILY_CREDITS_PER_STUDENT,
} from "@/lib/classSchedule";
import { getActivePaymentPlan } from "@/lib/paymentPlans";
import { getSupportContactId } from "@/lib/admin";
import { ClassBookingClient } from "./ClassBookingClient";

export default async function LessonsPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  // Booking a class requires curriculum access first — credits themselves
  // already can't be bought without it (see billing/lessons/page.tsx), but
  // this covers anyone who somehow already holds credits without it too.
  if (!session.user.hasCurriculumAccess) redirect("/billing/curriculum?next=lessons");

  // A student on an active Payment Plan already has their one weekly slot
  // auto-booked, and bookClass itself now refuses this same student's ad
  // hoc self-booking anyway (see classSchedule.ts), so sending them here at
  // all would just be a dead end. /schedule is their one real home now:
  // their week at a glance, plus the guided, directly-booked extra-session
  // flow that replaces self-serve booking for them.
  if (await getActivePaymentPlan(session.user.id)) redirect("/schedule");

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
