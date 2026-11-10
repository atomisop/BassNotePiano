import Link from "next/link";
import { getUpcomingOccurrences } from "@/lib/classSchedule";
import { getAdminOccurrences } from "@/lib/classScheduleAdmin";
import { getAllClassSchedules, countUpcomingBookingsBySchedule, getWindowHolders } from "@/lib/classScheduleManage";
import { getWaitlistByWindow, setupLinkFor } from "@/lib/slotWaitlist";
import { TodayView } from "../today/_view";
import { editWeeklyWindowAction, moveWindowWithEveryoneAction, previewWindowMoveAction } from "./weeklyTimeActions";
import { AdminScheduleManager } from "@/components/admin/AdminScheduleManager";
import { AdminAttendanceRoster } from "@/components/admin/AdminAttendanceRoster";
import { currentTeacherCalendarVersion, teacherCalendarToken } from "@/lib/teacherCalendar";
import { rotateTeacherCalendarLinkAction } from "./actions";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { getServerAuthSession } from "@/lib/auth";
import { getAdminBookingRequests } from "@/lib/bookingRequests";
import { AdminBookingRequests } from "@/components/admin/AdminBookingRequests";
import { getBoolSetting } from "@/lib/siteSettings";
import {
  createClassScheduleAction,
  setClassScheduleActiveAction,
  markAttendanceAction,
  undoAttendanceAction,
  setClassInPersonAction,
  confirmBookingRequestAction,
  declineBookingRequestAction,
} from "./actions";
import { buttonVariants } from "@/components/ui/button";
import { TAB_TRACK, tabItem } from "@/components/ui/tabStyles";
import { AdminReservations } from "@/components/admin/AdminReservations";
import { AdminCloseDay } from "@/components/admin/AdminClassTools";
import { getReservableHours, listOwnerReservations } from "@/lib/ownerReservationsAdmin";
import { Hint } from "@/components/ui/Hint";

type ViewValue = "TODAY" | "WINDOWS" | "REQUESTS" | "ATTENDANCE" | "RESERVED";

// Bookings and attendance used to be one combined view here (and, before
// that, their own top-level /admin/bookings tab), split into their own
// views now, by direct instruction: booking a student and marking
// attendance are two different everyday tasks that happened to share a
// page, not one task, and scrolling past a growing attendance history to
// reach the booking tool (or vice versa) got in the way of both.
const VIEWS: { label: string; value: ViewValue }[] = [
  { label: "Today", value: "TODAY" },
  { label: "Times", value: "WINDOWS" },
  { label: "Requests", value: "REQUESTS" },
  { label: "Attendance", value: "ATTENDANCE" },
  { label: "Reserved", value: "RESERVED" },
];

export const metadata = { title: "Admin: Schedule" };

export default async function AdminSchedulePage(props: { searchParams: Promise<{ view?: string; name?: string; email?: string; phone?: string; day?: string | string[] }> }) {
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

  // Today (the teaching day, one tap from any other view) is a view of Schedule since 2026-11-10.
  if (activeView === "TODAY") {
    return (
      <div>
        {viewSwitcher}
        <TodayView searchParams={Promise.resolve(searchParams)} />
      </div>
    );
  }

  if (activeView === "REQUESTS") {
    const [groups, requestMode, session] = await Promise.all([getAdminBookingRequests(), getBoolSetting("booking.requestMode"), getServerAuthSession()]);
    return (
      <div>
        <h1 className="sr-only">Weekly schedule</h1>

        {viewSwitcher}

        <div className="mt-6">
          <AdminBookingRequests
            groups={groups.map((g) => ({
              key: g.key,
              scheduledAt: g.scheduledAt.toISOString(),
              label: g.label,
              alreadyBooked: g.alreadyBooked,
              requests: g.requests.map((r) => ({ id: r.id, studentId: r.studentId, studentName: r.studentName, email: r.email, createdAt: r.createdAt.toISOString() })),
            }))}
            requestMode={requestMode}
            showSettingsLink={isOwnerEmail(session?.user?.email)}
            onConfirm={confirmBookingRequestAction}
            onDecline={declineBookingRequestAction}
          />
        </div>
      </div>
    );
  }

  if (activeView === "RESERVED") {
    const [hours, reservations] = await Promise.all([getReservableHours(), listOwnerReservations()]);
    return (
      <div>
        <h1 className="sr-only">Weekly schedule</h1>

        {viewSwitcher}

        <div className="mt-6">
          {/* ?name=&email=&phone= (from People and elsewhere) fills in the customer, so keeping a time for them is one step. */}
          <AdminReservations
            hours={hours}
            reservations={reservations}
            initial={{ name: (searchParams.name ?? "").slice(0, 120), email: (searchParams.email ?? "").slice(0, 200), phone: (searchParams.phone ?? "").slice(0, 40) }}
          />
        </div>

        {/* Closing a day cancels (or moves) every class on it, so it sits quietly at the end, behind its own confirm, not above the list. */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-50/8 pt-4">
          <p className="text-small text-slate-500"><Hint>A holiday or a sick day: close it, and every class that day is canceled or moved to another day.</Hint></p>
          <AdminCloseDay />
        </div>
      </div>
    );
  }

  if (activeView === "ATTENDANCE") {
    const occurrences = await getAdminOccurrences();

    return (
      <div>
        <h1 className="sr-only">Weekly schedule</h1>

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
  const [upcomingCounts, holders, waiting] = await Promise.all([
    countUpcomingBookingsBySchedule(schedules.map((s) => s.id)),
    getWindowHolders(schedules.map((s) => s.id)),
    getWaitlistByWindow(schedules.map((s) => s.id)),
  ]);
  const viewer = await getServerAuthSession();
  const viewerIsOwner = Boolean(viewer?.user && isOwnerEmail(viewer.user.email));
  const calendarHost = (process.env.NEXTAUTH_URL ?? "").replace(/^https?:\/\//, "");
  const calendarLink = calendarHost ? `webcal://${calendarHost}/api/calendar/teacher?t=${teacherCalendarToken(await currentTeacherCalendarVersion())}` : null;

  return (
    <div>
      <h1 className="sr-only">Weekly schedule</h1>

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
            upcomingBookings: upcomingCounts.get(s.id) ?? 0,
            holders: holders.get(s.id) ?? [],
            waiting: (waiting.get(s.id) ?? []).map((w) => ({ ...w, setupHref: setupLinkFor(w.userId, s.id, w.chunkIndex) })),
          }))}
          onCreate={createClassScheduleAction}
          onUpdate={editWeeklyWindowAction}
          onSetActive={setClassScheduleActiveAction}
          onPreviewMove={previewWindowMoveAction}
          onMoveEveryone={moveWindowWithEveryoneAction}
        />
      </div>

      {/* The calendar feed is a set-once tool, so it sits quietly under the times instead of above them. */}
      {calendarLink && (
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-50/8 pt-4">
          <a href={calendarLink} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Add my classes to my calendar
          </a>
          {viewerIsOwner && (
            <form action={rotateTeacherCalendarLinkAction}>
              <button type="submit" className={buttonVariants({ variant: "ghost", size: "sm", className: "text-slate-400" })}>
                New calendar link
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
