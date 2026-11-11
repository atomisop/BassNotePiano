import type { ReactNode } from "react";
import Link from "next/link";
import { NotifyPlaceToggle } from "@/components/admin/NotifyToggle";
import { getStillToMark, getTeachingDay } from "@/lib/teachingToday";
import { dayLong, dayTitle, dayWord, easternDay, parseDayParam, shiftDay, todayHref } from "@/lib/teachingDayRules";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarCheck, ChevronLeft, ChevronRight } from "@/components/ui/appIcons";
import { Meta } from "@/components/ui/CardKit";
import { TodayAttendance } from "@/components/admin/TodayAttendance";
import { ClassMessageButton, ClassMoveCancelButtons, ClassRowMenu, DiscordStepsButton } from "@/components/admin/ClassRowActions";
import { markAttendanceAction, undoAttendanceAction } from "../schedule/actions";

export const dynamic = "force-dynamic";

const time = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const shortDay = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });
const ago = (d: Date, now: number) => {
  const days = Math.floor((now - d.getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

/** A problem on a student's row: a coloured word, and the fix right beside it when there is one. */
type Problem = { text: string; tone: string; fix: ReactNode };

// A menu opened in a row must draw over the rows and the classes below it (each list is its own layer).
const LIFT = "relative has-[[aria-expanded=true]]:z-20";
const arrow = "tap inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neu-base text-slate-200 shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low";

/**
 * The teaching day: one day's classes with everything a teacher does about them right on the row (attendance, reschedule, cancel,
 * message, a note, the Discord steps, in person, the next scale), any day by `?day=YYYY-MM-DD` with arrows to step through, and on
 * today, the earlier classes still to mark.
 */
export async function TodayView(props: { searchParams: Promise<{ day?: string | string[] }> }) {
  const searchParams = await props.searchParams;
  const now = new Date();
  const today = easternDay(now);
  const day = parseDayParam(searchParams.day, today);
  const isToday = day === today;
  const [{ slots }, stillToMark] = await Promise.all([getTeachingDay(now, day), isToday ? getStillToMark(day) : Promise.resolve(null)]);
  const total = slots.reduce((n, s) => n + s.students.length, 0);
  const word = dayWord(day, today);

  return (
    <div>
      <h1 className="sr-only">{isToday ? "Today" : dayLong(day)}</h1>

      {/* Step through the days without leaving the screen. */}
      <nav aria-label="Choose a day" className="mt-2 flex items-center gap-2">
        <Link href={todayHref(shiftDay(day, -1), today)} aria-label="The day before" className={arrow}>
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1 text-center sm:flex-none sm:text-left">
          <p className="truncate text-body font-semibold text-slate-50">{dayTitle(day, today)}</p>
          <p className="text-small text-slate-500">
            {total > 0 ? `${total} student${total === 1 ? "" : "s"} in ${slots.length} class${slots.length === 1 ? "" : "es"}` : "No classes"}
          </p>
        </div>
        <Link href={todayHref(shiftDay(day, 1), today)} aria-label="The day after" className={arrow}>
          <ChevronRight aria-hidden className="h-4 w-4" />
        </Link>
        {!isToday && (
          <Link href="/admin/schedule?view=TODAY" className={buttonVariants({ variant: "ghost", size: "sm", className: "ml-1 hidden sm:inline-flex" })}>
            Back to today
          </Link>
        )}
      </nav>
      {!isToday && (
        <Link href="/admin/schedule?view=TODAY" className="tap mt-1 inline-flex items-center text-small text-slate-400 underline underline-offset-4 sm:hidden">
          Back to today
        </Link>
      )}

      <NotifyPlaceToggle place="attendance" label="Notify students when I mark or change a class" className="mt-4" />

      {slots.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<CalendarCheck />}
          title={isToday ? "No classes today" : `No classes ${word === "Tomorrow" || word === "Yesterday" ? word.toLowerCase() : `on ${word}`}`}
          description={isToday ? "Enjoy the quiet. Your coming classes are on the weekly schedule." : "Use the arrows to look at another day."}
        />
      ) : (
        <div className="mt-6 space-y-6">
          {slots.map((slot) => {
            const past = slot.startsAt.getTime() + 45 * 60_000 < now.getTime();
            return (
              <section key={slot.startsAt.getTime()} aria-label={`Class at ${time(slot.startsAt)}`} className={`${LIFT} ${past ? "opacity-70" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  {/* The time is the group's heading and its focal point; the label and the head count step back beside it. */}
                  <h2 className="flex flex-wrap items-baseline gap-x-3 px-1 text-title font-semibold tabular-nums text-slate-50">
                    {time(slot.startsAt)}
                    <span className="text-small font-normal text-slate-500">
                      {[slot.label, `${slot.students.length} ${slot.students.length === 1 ? "student" : "students"}`].filter(Boolean).join(" · ")}
                    </span>
                  </h2>
                  <ClassMessageButton studentIds={[...new Set(slot.students.map((s) => s.studentId))]} label={time(slot.startsAt)} />
                </div>
                {/* No overflow-hidden here: each row's More menu has to draw outside the panel. */}
                <ul className="mt-2 divide-y divide-slate-50/8 rounded-card bg-neu-base shadow-raised-low">
                  {slot.students.map((s) => {
                    // Problems are coloured words (red for money, amber for "check this"), never chips that look like every other fact.
                    // The Discord one carries its fix right beside it.
                    const problems = ([
                      s.billOverdue ? { text: "Bill overdue", tone: "text-red-400", fix: null } : null,
                      !s.discord.connected && !s.inPerson
                        ? { text: "Not on Discord yet", tone: "text-amber-300", fix: <DiscordStepsButton studentId={s.studentId} name={s.name} /> }
                        : null,
                    ] as (Problem | null)[]).filter((p): p is Problem => p !== null);
                    return (
                    <li key={s.bookingId} className={`${LIFT} flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between`}>
                      <div className="min-w-0">
                        <Link
                          href={`/admin/users/${s.studentId}`}
                          className="group inline-flex max-w-full items-center gap-1.5 rounded-sm text-body font-semibold text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="truncate">{s.name}</span>
                          <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
                        </Link>
                        <Meta
                          className="mt-0.5"
                          items={[
                            s.firstClass ? <span className="font-medium text-signal-fg">First class</span> : null,
                            s.inPerson ? "In person" : null,
                            s.nextScale?.state === "READY" ? <span className="font-medium text-slate-300">Ready for {s.nextScale.code}</span> : null,
                            s.planLabel ? `${s.planLabel} plan` : "No plan",
                            s.scale ? `Scale ${s.scale}` : null,
                            s.practicedDaysLast7 !== null ? `Practiced ${s.practicedDaysLast7}/7 days` : null,
                            `${s.credits} left`,
                            s.status === "COMPLETED" ? "Class done" : null,
                          ]}
                        />
                        {problems.length > 0 && (
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-small font-medium">
                            {problems.map((p, i) => (
                              <span key={p.text} className="inline-flex flex-wrap items-center gap-x-2">
                                {i > 0 && <span aria-hidden className="text-slate-500">·</span>}
                                <span className={p.tone}>{p.text}</span>
                                {p.fix}
                              </span>
                            ))}
                          </p>
                        )}
                        {s.note && (
                          <p className="mt-1 break-words text-small text-slate-400">
                            <span className="text-slate-500">Note {ago(s.note.at, now.getTime())}: </span>
                            {s.note.body.length > 160 ? `${s.note.body.slice(0, 160)}…` : s.note.body}
                          </p>
                        )}
                      </div>
                      {/* Marked and changed right here on a teaching day: no trip to Schedule or the student's page. */}
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <TodayAttendance
                          bookingId={s.bookingId}
                          name={s.name}
                          attendance={s.attendance}
                          started={slot.startsAt.getTime() <= now.getTime()}
                          onMark={markAttendanceAction}
                          onUndo={undoAttendanceAction}
                        />
                        <ClassRowMenu
                          notifyPlace="attendance"
                          row={{
                            bookingId: s.bookingId,
                            studentId: s.studentId,
                            name: s.name,
                            scheduledAt: slot.startsAt.toISOString(),
                            active: s.status === "SCHEDULED",
                            inPerson: s.inPerson,
                            discordConnected: s.discord.connected,
                            nextScale: s.nextScale,
                          }}
                        />
                      </div>
                    </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/* Earlier classes nobody marked yet, marked right here instead of on Schedule > Attendance. */}
      {stillToMark && stillToMark.total > 0 && (
        <section aria-label="Still to mark" className={`${LIFT} mt-8`}>
          <h2 className="px-1 text-small font-medium uppercase tracking-caps text-amber-300">Still to mark · {stillToMark.total}</h2>
          <ul className="mt-2 divide-y divide-slate-50/8 rounded-card bg-neu-base shadow-raised-low">
            {stillToMark.rows.map((r) => (
              <li key={r.bookingId} className={`${LIFT} flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between`}>
                <div className="min-w-0">
                  <Link
                    href={`/admin/users/${r.studentId}`}
                    className="group inline-flex max-w-full items-center gap-1.5 rounded-sm text-body font-semibold text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate">{r.name}</span>
                    <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
                  </Link>
                  <Meta className="mt-0.5" items={[`${shortDay(r.scheduledAt)}, ${time(r.scheduledAt)}`, r.label, r.inPerson ? "In person" : null]} />
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <TodayAttendance bookingId={r.bookingId} name={r.name} attendance={null} started onMark={markAttendanceAction} onUndo={undoAttendanceAction} />
                  <ClassMoveCancelButtons
                    notifyPlace="attendance"
                    row={{ bookingId: r.bookingId, studentId: r.studentId, name: r.name, scheduledAt: r.scheduledAt.toISOString(), active: true }}
                  />
                </div>
              </li>
            ))}
          </ul>
          {stillToMark.total > stillToMark.rows.length && (
            <Link href="/admin/schedule?view=ATTENDANCE" className="tap mt-2 inline-flex items-center text-small text-slate-400 underline underline-offset-4">
              See all {stillToMark.total} on Attendance
            </Link>
          )}
        </section>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/admin/schedule" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Weekly schedule
        </Link>
      </div>
    </div>
  );
}
