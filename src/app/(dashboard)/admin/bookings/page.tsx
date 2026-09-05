import { getAdminOccurrences } from "@/lib/classSchedule";
import { AdminAttendanceRoster } from "@/components/admin/AdminAttendanceRoster";
import { markAttendanceAction, adminCancelBookingAction } from "./actions";

export default async function AdminBookingsPage() {
  const occurrences = await getAdminOccurrences();

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Class attendance</h1>
      <p className="mt-2 text-sm text-slate-500">
        Every occurrence with a booking, past and upcoming — marking Present or No-show is what actually charges the
        credit, so mark it either way once a class has happened. Cancel any time before then at no charge.
      </p>

      <div className="mt-6">
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
  );
}
