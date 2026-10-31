import Link from "next/link";
import { getUpcomingOccurrences } from "@/lib/classSchedule";
import { getAdminOccurrences } from "@/lib/classScheduleAdmin";
import { getAllClassSchedules, countUpcomingBookingsBySchedule } from "@/lib/classScheduleManage";
import { AdminScheduleManager } from "@/components/admin/AdminScheduleManager";
import { AdminAttendanceRoster } from "@/components/admin/AdminAttendanceRoster";
import { teacherCalendarToken } from "@/lib/teacherCalendar";
import {
  createClassScheduleAction,
  updateClassScheduleAction,
  setClassScheduleActiveAction,
  markAttendanceAction,
  undoAttendanceAction,
  setClassInPersonAction,
} from "./actions";
import { buttonVariants } from "@/components/ui/button";
import { TAB_TRACK, tabItem } from "@/components/ui/tabStyles";
import { AdminReservations } from "@/components/admin/AdminReservations";
import { getReservableHours, listOwnerReservations } from "@/lib/ownerReservationsAdmin";
import { PageBack } from "@/components/ui/BackLink";

type ViewValue = "WINDOWS" | "ATTENDANCE" | "RESERVED";

// Bookings and attendance used to be one combined view here (and, before
// that, their own top-level /admin/bookings tab), split into their own
// views now, by direct instruction: booking a student and marking
// attendance are two different everyday tasks that happened to share a
// page, not one task, and scrolling past a growing attendance history to
// reach the booking tool (or vice versa) got in the way of both.
const VIEWS: { label: string; value: ViewValue }[] = [
  { label: "Times", value: "WINDOWS" },
  { label: "Attendance", value: "ATTENDANCE" },
  { label: "Reserved", value: "RESERVED" },
];

export const metadata = { title: "Admin: Schedule" };

export default async function AdminSchedulePage(props: { searchParams: Promise<{ view?: string }> }) {
  const searchParams = await props.searchParams;
  const requested = searchParams.view?.toUpperCase();
  const activeView = VIEWS.find((v) => v.value === requested)?.value ?? "WINDOWS";

  const viewSwitcher = (
    <div className={`mt-6 ${TAB_TRACK}`}>
      {VIEWS.map((view) => (
        <Link
          key={view.value}
          href={view.value === "WINDOWS" ? "/admin/schedule" : `/admin/schedule?view=${view.value}`}
          className={tabItem(activeView === view.value)}
        >
          {view.label}
        </Link>
      ))}
    </div>
  );

  if (activeView === "RESERVED") {
    const [hours, reservations] = await Promise.all([getReservableHours(), listOwnerReservations()]);
    return (
      <div>
        <div data-deck-header className="deck-header -mt-4 pt-4">
          <PageBack href="/admin" />
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Admin</p>
          <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Weekly schedule</h1>
        </div>

        {viewSwitcher}

        <div className="mt-6">
          <AdminReservations hours={hours} reservations={reservations} />
        </div>
      </div>
    );
  }

  if (activeView === "ATTENDANCE") {
    const occurrences = await getAdminOccurrences();

    return (
      <div>
        <div data-deck-header className="deck-header -mt-4 pt-4">
          <PageBack href="/admin" />
          <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Admin</p>
          <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Weekly schedule</h1>
        </div>

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
            onSetInPerson={setClassInPersonAction}
            onUndoAttendance={undoAttendanceAction}
          />
        </div>
      </div>
    );
  }

  const schedules = await getAllClassSchedules();
  const upcomingCounts = await countUpcomingBookingsBySchedule(schedules.map((s) => s.id));
  const calendarHost = (process.env.NEXTAUTH_URL ?? "").replace(/^https?:\/\//, "");
  const calendarLink = calendarHost ? `webcal://${calendarHost}/api/calendar/teacher?t=${teacherCalendarToken()}` : null;

  return (
    <div>
      <div data-deck-header className="deck-header -mt-4 pt-4">
        <PageBack href="/admin" />
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Admin</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Weekly schedule</h1>
      </div>

      {viewSwitcher}

      {calendarLink && (
        <a href={calendarLink} className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-6" })}>
          Add my classes to my calendar
        </a>
      )}

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
            upcomingBookings: upcomingCounts.get(s.id) ?? 0,
          }))}
          onCreate={createClassScheduleAction}
          onUpdate={updateClassScheduleAction}
          onSetActive={setClassScheduleActiveAction}
        />
      </div>
    </div>
  );
}
