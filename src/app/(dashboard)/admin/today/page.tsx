import Link from "next/link";
import { NotifyPlaceToggle } from "@/components/admin/NotifyToggle";
import { getTeachingDay } from "@/lib/teachingToday";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarCheck, ChevronRight } from "@/components/ui/appIcons";
import { Meta } from "@/components/ui/CardKit";
import { TodayAttendance } from "@/components/admin/TodayAttendance";
import { markAttendanceAction, undoAttendanceAction } from "../schedule/actions";

export const metadata = { title: "Admin: Today" };
export const dynamic = "force-dynamic";

const time = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const ago = (d: Date, now: number) => {
  const days = Math.floor((now - d.getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

export default async function AdminTodayPage() {
  const now = new Date();
  const { slots } = await getTeachingDay(now);
  const total = slots.reduce((n, s) => n + s.students.length, 0);

  return (
    <div>
      <h1 className="sr-only">Today</h1>
      <p className="mt-2 px-1 text-small text-slate-500">
        {now.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" })}
        {total > 0 ? `: ${total} student${total === 1 ? "" : "s"} in ${slots.length} class${slots.length === 1 ? "" : "es"}` : ""}
      </p>

      {slots.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<CalendarCheck />}
          title="No classes today"
          description="Enjoy the quiet. Your coming classes are on the weekly schedule."
        />
      ) : (
        <div className="mt-6 space-y-6">
          <NotifyPlaceToggle place="attendance" label="Notify students when I mark or undo" />
          {slots.map((slot) => {
            const past = slot.startsAt.getTime() + 45 * 60_000 < now.getTime();
            return (
              <section key={slot.startsAt.getTime()} aria-label={`Class at ${time(slot.startsAt)}`} className={past ? "opacity-70" : undefined}>
                {/* The time is the group's heading and its focal point; the label and the head count step back beside it. */}
                <h2 className="flex flex-wrap items-baseline gap-x-3 px-1 text-title font-semibold tabular-nums text-slate-50">
                  {time(slot.startsAt)}
                  <span className="text-small font-normal text-slate-500">
                    {[slot.label, `${slot.students.length} ${slot.students.length === 1 ? "student" : "students"}`].filter(Boolean).join(" · ")}
                  </span>
                </h2>
                <ul className="mt-2 divide-y divide-slate-50/8 overflow-hidden rounded-card bg-slate-50/4 ring-1 ring-inset ring-slate-50/8">
                  {slot.students.map((s) => {
                    // Problems are coloured words (red for money, amber for "check this"), never chips that look like every other fact.
                    const problems = [
                      s.billOverdue ? { text: "Bill overdue", tone: "text-red-400" } : null,
                      !s.discord.connected && !s.inPerson ? { text: "Not on Discord yet", tone: "text-amber-300" } : null,
                    ].filter((p): p is { text: string; tone: string } => p !== null);
                    return (
                    <li key={s.bookingId} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
                            s.planLabel ? `${s.planLabel} plan` : "No plan",
                            s.scale ? `Scale ${s.scale}` : null,
                            s.practicedDaysLast7 !== null ? `Practiced ${s.practicedDaysLast7}/7 days` : null,
                            `${s.credits} left`,
                            s.status === "COMPLETED" ? "Class done" : null,
                          ]}
                        />
                        {problems.length > 0 && (
                          <p className="mt-0.5 text-small font-medium">
                            {problems.map((p, i) => (
                              <span key={p.text} className={p.tone}>
                                {i > 0 && <span aria-hidden className="text-slate-500"> · </span>}
                                {p.text}
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
                      {/* Marked right here on a teaching day: no trip to Schedule > Attendance. */}
                      <div className="shrink-0">
                        <TodayAttendance
                          bookingId={s.bookingId}
                          name={s.name}
                          attendance={s.attendance}
                          started={slot.startsAt.getTime() <= now.getTime()}
                          onMark={markAttendanceAction}
                          onUndo={undoAttendanceAction}
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

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/admin/schedule" className={buttonVariants({ variant: "ghost", size: "sm" })}>Weekly schedule</Link>
        <Link href="/admin/schedule?view=ATTENDANCE" className={buttonVariants({ variant: "ghost", size: "sm" })}>Earlier classes to mark</Link>
      </div>
    </div>
  );
}
