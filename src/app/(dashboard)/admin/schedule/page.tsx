import Link from "next/link";
import { getAllClassSchedules, getAdminOccurrences, getUpcomingOccurrences } from "@/lib/classSchedule";
import { AdminScheduleManager } from "@/components/admin/AdminScheduleManager";
import { AdminAttendanceRoster } from "@/components/admin/AdminAttendanceRoster";
import { AdminManualBooking } from "@/components/admin/AdminManualBooking";
import {
  createClassScheduleAction,
  updateClassScheduleAction,
  setClassScheduleActiveAction,
  markAttendanceAction,
  undoAttendanceAction,
  adminCancelBookingAction,
  searchStudentsForBookingAction,
  adminBookClassAction,
} from "./actions";

type ViewValue = "WINDOWS" | "BOOKINGS" | "ATTENDANCE";

// Bookings and attendance used to be one combined view here (and, before
// that, their own top-level /admin/bookings tab) — split into their own
// views now, by direct instruction: booking a student and marking
// attendance are two different everyday tasks that happened to share a
// page, not one task, and scrolling past a growing attendance history to
// reach the booking tool (or vice versa) got in the way of both.
const VIEWS: { label: string; value: ViewValue }[] = [
  { label: "Weekly windows", value: "WINDOWS" },
  { label: "Bookings", value: "BOOKINGS" },
  { label: "Attendance", value: "ATTENDANCE" },
];

export default async function AdminSchedulePage({ searchParams }: { searchParams: { view?: string } }) {
  const requested = searchParams.view?.toUpperCase();
  const activeView = VIEWS.find((v) => v.value === requested)?.value ?? "WINDOWS";

  const viewSwitcher = (
    <div className="mt-6 flex w-fit flex-wrap gap-1.5 rounded-full p-1 bg-neu-base shadow-pressed-low">
      {VIEWS.map((view) => (
        <Link
          key={view.value}
          href={view.value === "WINDOWS" ? "/admin/schedule" : `/admin/schedule?view=${view.value}`}
          className={`rounded-full px-3 py-1.5 text-small font-medium transition ${
            activeView === view.value ? "bg-[rgb(var(--signal)/0.14)] text-signal" : "text-slate-400 hover:text-slate-100"
          }`}
        >
          {view.label}
        </Link>
      ))}
    </div>
  );

  if (activeView === "BOOKINGS") {
    const upcoming = await getUpcomingOccurrences();
    const openOccurrences = upcoming.filter((o) => !o.isBooked);

    return (
      <div>
        <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Weekly schedule</h1>

        {viewSwitcher}

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
      </div>
    );
  }

  if (activeView === "ATTENDANCE") {
    const occurrences = await getAdminOccurrences();

    return (
      <div>
        <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Weekly schedule</h1>

        {viewSwitcher}

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
            onUndoAttendance={undoAttendanceAction}
          />
        </div>
      </div>
    );
  }

  const schedules = await getAllClassSchedules();

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Weekly schedule</h1>
      <p className="mt-2 text-small text-slate-500">
        The recurring windows students book classes into. Turning one off stops it from showing up as bookable —
        existing bookings and their history are never affected.
      </p>

      {viewSwitcher}

      <div className="mt-6">
        <AdminScheduleManager
          schedules={schedules.map((s) => ({
            id: s.id,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            durationMin: s.durationMin,
            creditCost: s.creditCost,
            label: s.label,
            active: s.active,
          }))}
          onCreate={createClassScheduleAction}
          onUpdate={updateClassScheduleAction}
          onSetActive={setClassScheduleActiveAction}
        />
      </div>
    </div>
  );
}
