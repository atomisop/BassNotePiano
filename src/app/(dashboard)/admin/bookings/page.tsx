import { getAdminOccurrences, getUpcomingOccurrences } from "@/lib/classSchedule";
import { AdminAttendanceRoster } from "@/components/admin/AdminAttendanceRoster";
import { AdminManualBooking } from "@/components/admin/AdminManualBooking";
import { markAttendanceAction, adminCancelBookingAction, searchStudentsForBookingAction, adminBookClassAction } from "./actions";

export default async function AdminBookingsPage() {
  const [occurrences, upcoming] = await Promise.all([getAdminOccurrences(), getUpcomingOccurrences()]);
  const openOccurrences = upcoming.filter((o) => !o.isBooked);

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Bookings</h1>
      <p className="mt-2 text-sm text-slate-500">
        Book a student directly for a booking issue you&apos;re helping them with, or manage attendance on existing
        bookings below.
      </p>

      <div className="mt-6">
        <AdminManualBooking
          openOccurrences={openOccurrences.map((o) => ({
            scheduleId: o.scheduleId,
            occurrenceDateMs: o.occurrenceDate.getTime(),
            chunkIndex: o.chunkIndex,
            label: o.label,
            scheduledAt: o.scheduledAt.toISOString(),
            creditCost: o.creditCost,
          }))}
          onSearchStudents={searchStudentsForBookingAction}
          onBook={adminBookClassAction}
        />
      </div>

      <div className="mt-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Class attendance</p>
        <p className="mt-1.5 text-sm text-slate-500">
          Every occurrence with a booking, past and upcoming. Marking Present or No-show is what actually charges
          the credit, so mark it either way once a class has happened. Cancel any time before then at no charge.
        </p>

        <div className="mt-4">
          <AdminAttendanceRoster
            occurrences={occurrences.map((o) => ({
              scheduleId: o.scheduleId,
              label: o.label,
              dayOfWeek: o.dayOfWeek,
              occurrenceDateMs: o.occurrenceDate.getTime(),
              scheduledAt: o.scheduledAt.toISOString(),
              roster: o.roster,
            }))}
            onMarkAttendance={markAttendanceAction}
            onCancelBooking={adminCancelBookingAction}
          />
        </div>
      </div>
    </div>
  );
}
