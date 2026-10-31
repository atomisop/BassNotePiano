import Link from "next/link";
import { getTeachingDay } from "@/lib/teachingToday";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarCheck } from "@/components/ui/appIcons";
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
      <div data-deck-header className="deck-header -mt-4 pt-4">
      <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Admin</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Today</h1>
      </div>
      <p className="mt-2 text-small text-slate-500">
        {now.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" })}
        {total > 0 ? `: ${total} student${total === 1 ? "" : "s"} in ${slots.length} class${slots.length === 1 ? "" : "es"}` : ""}
      </p>

      {slots.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<CalendarCheck />}
          title="No classes today"
          description="Enjoy the quiet. Your coming classes are on the weekly schedule."
          actionLabel="Weekly schedule"
          actionHref="/admin/schedule"
        />
      ) : (
        <div className="mt-6 space-y-6">
          {slots.map((slot) => {
            const past = slot.startsAt.getTime() + 45 * 60_000 < now.getTime();
            return (
              <section key={slot.startsAt.getTime()} aria-label={`Class at ${time(slot.startsAt)}`} className={past ? "opacity-70" : undefined}>
                <h2 className="flex flex-wrap items-baseline gap-x-3 text-title font-semibold text-slate-50">
                  {time(slot.startsAt)}
                  {slot.label && <span className="text-small font-normal text-slate-500">{slot.label}</span>}
                </h2>
                <ul className="glass-surface mt-2 divide-y divide-slate-50/10 px-4">
                  {slot.students.map((s) => (
                    <li key={s.bookingId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Link href={`/admin/users/${s.studentId}`} className="text-body font-medium text-slate-50 underline-offset-4 hover:underline">{s.name}</Link>
                        {s.firstClass && <span className="rounded-full bg-neu-base px-2 py-0.5 text-small text-slate-200 shadow-pressed-low">First class</span>}
                        {s.inPerson && <span className="rounded-full bg-neu-base px-2 py-0.5 text-small text-slate-300 shadow-pressed-low">In person</span>}
                        {s.status === "COMPLETED" && <span className="text-small text-slate-500">Class done</span>}
                      </div>
                      <p className="mt-1 text-small text-slate-400">
                        {[
                          s.planLabel ? `${s.planLabel} plan` : "No plan",
                          s.scale ? `Scale ${s.scale}` : null,
                          s.practicedDaysLast7 !== null ? `Practiced ${s.practicedDaysLast7}/7 days` : null,
                          `${s.credits} left`,
                          s.discord.connected ? "On Discord" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {(!s.discord.connected || s.billOverdue) && (
                        <p className="mt-1 text-small text-amber-300">
                          {[!s.discord.connected && !s.inPerson ? "Not on Discord yet" : null, s.billOverdue ? "Bill overdue" : null].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {s.note && (
                        <p className="mt-1 break-words text-small text-slate-300">
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
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/admin/schedule" className={buttonVariants({ variant: "secondary", size: "sm" })}>Weekly schedule</Link>
        <Link href="/admin/schedule?view=ATTENDANCE" className={buttonVariants({ variant: "ghost", size: "sm" })}>Earlier classes to mark</Link>
      </div>
    </div>
  );
}
