import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Flame, Trophy, CalendarDays, Sparkles } from "lucide-react";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DAILY_GOAL_SECONDS, etDayKey, getFingerPracticeStatus } from "@/lib/fingerPractice";
import { STREAK_GOALS, longestStreak, nextStreakGoal, practicedThisMonth, streakCalendar } from "@/lib/streakRules";
import { WideLayout } from "@/components/layout/PageLayouts";
import { Card, Eyebrow } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Your streak" };

const WEEKS_PHONE = 12;
const WEEKS_WIDE = 26;
const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The practice streak in full (the flame in the top bar opens it): days in a row, today's 10 minutes, the best run, the next goal, and
 * a calendar of every practiced day for the last half year (about four months on a phone).
 */
export default async function StreakPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/streak");
  const userId = session.user.id;

  const [status, rows] = await Promise.all([
    getFingerPracticeStatus(userId),
    prisma.fingerPracticeDay.findMany({ where: { userId, completedAt: { not: null } }, select: { day: true }, orderBy: { day: "desc" }, take: 2000 }),
  ]);
  const today = etDayKey();
  const days = rows.map((r) => r.day);
  const best = Math.max(longestStreak(days), status.streak);
  const goal = nextStreakGoal(status.streak);
  const calendar = streakCalendar(days, today, WEEKS_WIDE);
  const minutesDone = Math.floor(status.todaySeconds / 60);
  const goalMinutes = DAILY_GOAL_SECONDS / 60;

  const headline = status.completedToday
    ? "Done for today. Come back tomorrow to keep it going."
    : status.streak > 0
      ? `Practice today to keep your ${status.streak} day streak.`
      : `Practice ${goalMinutes} minutes today to start a streak.`;

  return (
    <WideLayout>
      <div className="pt-4 md:pt-6">
        <Eyebrow>Practice</Eyebrow>
        <h1 className="mt-1 text-hero font-semibold text-slate-50">Your streak</h1>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="grid min-w-0 gap-3">
          {/* The streak itself: the flame, the number, and what to do today. */}
          <Card className="overflow-hidden p-5 md:p-6">
            <div className="flex items-center gap-5">
              <div
                className={cn(
                  "flex h-20 w-20 shrink-0 items-center justify-center rounded-full md:h-24 md:w-24",
                  status.completedToday ? "bg-signal/16" : "bg-neu-base shadow-pressed-low",
                )}
              >
                <Flame
                  aria-hidden
                  className={cn("h-10 w-10 md:h-12 md:w-12", status.completedToday ? "text-signal-fg" : "text-slate-400")}
                  fill={status.completedToday ? "currentColor" : "none"}
                  strokeWidth={1.8}
                />
              </div>
              <div className="min-w-0">
                <p className="text-[3.25rem] font-bold leading-none tabular-nums text-slate-50 md:text-[4rem]">{status.streak}</p>
                <p className="mt-1 text-body font-semibold text-slate-200">day streak</p>
              </div>
            </div>
            <p className="mt-5 text-body text-slate-300">{headline}</p>
            <div className="mt-4">
              <div className="flex items-center justify-between text-small text-slate-400">
                <span>Today</span>
                <span className="tabular-nums">
                  {Math.min(minutesDone, goalMinutes)} of {goalMinutes} minutes
                </span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-neu-base shadow-pressed-low"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={DAILY_GOAL_SECONDS}
                aria-valuenow={status.todaySeconds}
                aria-label="Practice today"
              >
                <div className="h-full rounded-full bg-signal" style={{ width: `${Math.round((status.todaySeconds / DAILY_GOAL_SECONDS) * 100)}%` }} />
              </div>
            </div>
            {!status.completedToday && (
              <Link href="/practice" className={cn(buttonVariants(), "mt-5")}>
                {status.todaySeconds > 0 ? "Continue practice" : "Practice now"}
              </Link>
            )}
          </Card>

          {/* Every practiced day: a column per week, Sunday at the top, today ringed. */}
          <Card className="p-5 md:p-6">
            <div className="flex items-center justify-between">
              <Eyebrow>Practice days</Eyebrow>
              <span className="text-small text-slate-400">
                <span className="md:hidden">Last {WEEKS_PHONE} weeks</span>
                <span className="hidden md:inline">Last 6 months</span>
              </span>
            </div>
            <div className="mt-4 flex gap-1.5" role="img" aria-label={`${days.length} practiced days in all, ${status.streak} in a row now`}>
              <div aria-hidden className="grid shrink-0 grid-rows-7 gap-1 pr-1 md:gap-1.5 text-[0.625rem] leading-none text-slate-500">
                {WEEKDAY_LETTERS.map((l, i) => (
                  <span key={i} className="flex h-[var(--cell)] items-center [--cell:1rem] md:[--cell:1.25rem]">
                    {l}
                  </span>
                ))}
              </div>
              <div className="flex min-w-0 flex-1 justify-between gap-1">
                {calendar.map((week, w) => (
                  <div key={week[0].day} className={cn("grid grid-rows-7 gap-1 md:gap-1.5", w < WEEKS_WIDE - WEEKS_PHONE && "hidden md:grid")}>
                    {week.map((cell) => (
                      <span
                        key={cell.day}
                        title={cell.future ? undefined : `${cell.day}: ${cell.practiced ? "practiced" : "not practiced"}`}
                        className={cn(
                          "block h-4 w-4 rounded-[0.25rem] md:h-5 md:w-5",
                          cell.future ? "bg-transparent" : cell.practiced ? "bg-signal" : "bg-neu-base shadow-pressed-low",
                          cell.isToday && "ring-[1.5px] ring-inset ring-slate-300",
                        )}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div className="grid min-w-0 gap-3">
          <Card className="grid grid-cols-3 gap-2 p-4 md:p-5">
            <Fact icon={<Trophy aria-hidden className="h-4 w-4" />} value={best} label="Best streak" />
            <Fact icon={<CalendarDays aria-hidden className="h-4 w-4" />} value={practicedThisMonth(days, today)} label="This month" />
            <Fact icon={<Sparkles aria-hidden className="h-4 w-4" />} value={days.length} label="All time" />
          </Card>

          <Card className="p-5">
            <Eyebrow>{goal ? "Next goal" : "Every goal reached"}</Eyebrow>
            {goal ? (
              <>
                <p className="mt-2 text-body font-semibold text-slate-50">
                  {goal} days in a row <span className="font-normal text-slate-400">({goal - status.streak} to go)</span>
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-neu-base shadow-pressed-low">
                  <div className="h-full rounded-full bg-signal" style={{ width: `${Math.round((status.streak / goal) * 100)}%` }} />
                </div>
              </>
            ) : (
              <p className="mt-2 text-body font-semibold text-slate-50">A full year in a row.</p>
            )}
            <ul className="mt-4 flex flex-wrap gap-2">
              {STREAK_GOALS.map((g) => {
                const reached = best >= g;
                return (
                  <li
                    key={g}
                    className={cn(
                      "inline-flex h-8 items-center gap-1 rounded-full px-3 text-small font-semibold tabular-nums",
                      reached ? "bg-signal/16 text-signal-fg" : "bg-neu-base text-slate-400 shadow-pressed-low",
                    )}
                  >
                    {reached && <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />}
                    {g} days
                    <span className="sr-only">{reached ? ", reached" : ", not reached yet"}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </WideLayout>
  );
}

function Fact({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-slate-400">{icon}</span>
      <span className="mt-1.5 text-[1.5rem] font-bold leading-none tabular-nums text-slate-50">{value}</span>
      <span className="mt-1 text-small text-slate-400">{label}</span>
    </div>
  );
}
