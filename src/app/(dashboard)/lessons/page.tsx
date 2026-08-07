import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getClassCreditBalance, getUpcomingOccurrences, getUserClassBookings, CANCELLATION_CUTOFF_HOURS } from "@/lib/classSchedule";
import { ClassBookingClient } from "./ClassBookingClient";

export default async function LessonsPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");

  const [credits, occurrences, bookings] = await Promise.all([
    getClassCreditBalance(session.user.id),
    getUpcomingOccurrences(),
    getUserClassBookings(session.user.id),
  ]);

  return (
    <ClassBookingClient
      initialCredits={credits}
      cancellationCutoffHours={CANCELLATION_CUTOFF_HOURS}
      occurrences={occurrences.map((o) => ({
        scheduleId: o.scheduleId,
        label: o.label,
        dayOfWeek: o.dayOfWeek,
        durationMin: o.durationMin,
        creditCost: o.creditCost,
        occurrenceDateMs: o.occurrenceDate.getTime(),
        scheduledAt: o.scheduledAt.toISOString(),
        seatsBooked: o.seatsBooked,
        seatsLeft: o.seatsLeft,
        isFull: o.isFull,
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
