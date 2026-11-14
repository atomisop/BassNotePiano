import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Map, Trophy, Video } from "@/components/ui/appIcons";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DAILY_GOAL_SECONDS, etDayKey, getFingerPracticeStatus } from "@/lib/fingerPractice";
import { STREAK_GOALS, longestStreak, nextStreakGoal, practicedThisMonth, streakCalendar } from "@/lib/streakRules";
import { WideLayout } from "@/components/layout/PageLayouts";
import { Eyebrow } from "@/components/ui/Card";
import { Fact, Facts } from "@/components/ui/CardKit";
import { HeroBand } from "@/components/ui/HeroBand";
import { ActionTiles } from "@/components/ui/ActionTiles";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PageBack } from "@/components/ui/BackLink";

export const metadata = { title: "Your streak" };

const WEEKS_PHONE = 12;
const WEEKS_WIDE = 26;
/** A quiet card under the band (DESIGN.md, "Band, sheet and tiles" 6); each one is a card of the deck. */
const QUIET_CARD = "deck-card relative lgx-card rounded-card";
const CARD_LABEL = "text-caption font-medium uppercase tracking-caps text-slate-500";
const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The practice streak in full (the flame in the top bar opens it): the days in a row on the band with today's 10 minutes on its sheet,
 * a few tiles for where to go next, then quiet cards: a calendar of every practiced day for the last half year (about three months on
 * a phone), the best run and the next goal.
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
    <WideLayout deckDesktop>
      <div data-deck-header className="deck-header pt-4 md:pt-6">
        <PageBack href="/dashboard" />
        <Eyebrow>Practice</Eyebrow>
        <h1 className="mt-1 text-hero font-semibold text-slate-50">Your streak</h1>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-3">
          {/* The one fact here: the days in a row, on the band. Today's 10 minutes and its button sit on the sheet under it. */}
          <HeroBand eyebrow="Right now" title={status.streak === 1 ? "Day in a row" : "Days in a row"} figure={status.streak} meta={headline} className="deck-card">
            <div className="pt-3">
              <div className="flex items-center justify-between text-small text-slate-500">
                <span>Today</span>
                <span className="font-medium tabular-nums text-slate-300">
                  {Math.min(minutesDone, goalMinutes)} of {goalMinutes} minutes
                </span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-slate-50/10"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={DAILY_GOAL_SECONDS}
                aria-valuenow={status.todaySeconds}
                aria-label="Practice today"
              >
                <div className="h-full rounded-full bg-signal" style={{ width: `${Math.min(100, Math.round((status.todaySeconds / DAILY_GOAL_SECONDS) * 100))}%` }} />
              </div>
              {!status.completedToday && (
                <div className="mt-4 flex justify-end">
                  <Link href="/practice" className={buttonVariants({ className: "w-full sm:w-auto" })}>
                    {status.todaySeconds > 0 ? "Continue practice" : "Practice now"}
                  </Link>
                </div>
              )}
            </div>
          </HeroBand>

          <ActionTiles
            title="Where to next"
            items={[
              { href: "/leaderboard", label: "Leaderboard", detail: "Minutes this week", icon: <Trophy /> },
              { href: "/roadmap", label: "Roadmap", detail: "Your scales", icon: <Map /> },
              { href: "/lessons", label: "Classes", detail: "Your live lessons", icon: <Video /> },
            ]}
            className="py-2"
          />

          {/* Every practiced day: a column per week, Sunday at the top, today ringed. */}
          <section aria-label="Practice days" className={cn(QUIET_CARD, "p-5 md:p-6")}>
            <div className="flex items-center justify-between">
              <h2 className={CARD_LABEL}>Practice days</h2>
              <span className="text-small text-slate-400">
                <span className="md:hidden">Last {WEEKS_PHONE} weeks</span>
                <span className="hidden md:inline">Last 6 months</span>
              </span>
            </div>
            {/* Six months is 26 columns: 20px cells fit a full-width card but not the narrower left column a computer gets from lg
                (the grid ran under the right column, 2026-11-02 audit), so lg uses the phone's 16px cells and 2xl goes back to 20px. */}
            <div className="mt-4 flex gap-1.5" role="img" aria-label={`${days.length} practiced days in all, ${status.streak} in a row now`}>
              <div aria-hidden className="grid shrink-0 grid-rows-7 gap-1 pr-1 md:gap-1.5 lg:gap-1 2xl:gap-1.5 text-caption leading-none text-slate-500">
                {WEEKDAY_LETTERS.map((l, i) => (
                  <span key={i} className="flex h-[var(--cell)] items-center [--cell:1rem] md:[--cell:1.25rem] lg:[--cell:1rem] 2xl:[--cell:1.25rem]">
                    {l}
                  </span>
                ))}
              </div>
              <div className="flex min-w-0 flex-1 justify-between gap-1">
                {calendar.map((week, w) => (
                  <div key={week[0].day} className={cn("grid grid-rows-7 gap-1 md:gap-1.5 lg:gap-1 2xl:gap-1.5", w < WEEKS_WIDE - WEEKS_PHONE && "hidden md:grid")}>
                    {week.map((cell) => (
                      <span
                        key={cell.day}
                        title={cell.future ? undefined : `${cell.day}: ${cell.practiced ? "practiced" : "not practiced"}`}
                        className={cn(
                          "block h-4 w-4 rounded-[0.25rem] md:h-5 md:w-5 lg:h-4 lg:w-4 2xl:h-5 2xl:w-5",
                          cell.future ? "bg-transparent" : cell.practiced ? "bg-signal" : "bg-slate-50/8",
                          cell.isToday && "ring-[1.5px] ring-inset ring-slate-300",
                        )}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          {/* Supporting figures, a step quieter than the streak itself: value first, a small label under it. */}
          <div className={cn(QUIET_CARD, "p-4 md:p-5")}>
            <Facts columns={3} className="grid-cols-3">
              <Fact label="Best streak" value={dayCount(best)} />
              <Fact label="This month" value={dayCount(practicedThisMonth(days, today))} />
              <Fact label="All time" value={dayCount(days.length)} />
            </Facts>
          </div>

          <section aria-label={goal ? "Next goal" : "Every goal reached"} className={cn(QUIET_CARD, "p-5")}>
            <h2 className={CARD_LABEL}>{goal ? "Next goal" : "Every goal reached"}</h2>
            {goal ? (
              <>
                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <p className="text-title font-semibold tabular-nums text-slate-50">{goal} days in a row</p>
                  <p className="shrink-0 text-small tabular-nums text-slate-400">{goal - status.streak} to go</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-50/10">
                  <div className="h-full rounded-full bg-signal" style={{ width: `${Math.round((status.streak / goal) * 100)}%` }} />
                </div>
              </>
            ) : (
              <p className="mt-2 text-title font-semibold text-slate-50">A full year in a row.</p>
            )}
            {/* The goals as quiet marks: reached ones ticked, the next one outlined, the rest faint. Only the bar above is orange. */}
            <ul className="mt-4 flex flex-wrap gap-2">
              {STREAK_GOALS.map((g) => {
                const reached = best >= g;
                return (
                  <li
                    key={g}
                    className={cn(
                      "inline-flex h-8 items-center gap-1 rounded-full px-3 text-small font-medium tabular-nums",
                      reached ? "bg-slate-50/8 text-slate-200" : g === goal ? "text-slate-50 ring-1 ring-inset ring-signal/60" : "text-slate-500 ring-1 ring-inset ring-slate-50/8",
                    )}
                  >
                    {reached && <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />}
                    {g} days
                    <span className="sr-only">{reached ? ", reached" : ", not reached yet"}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </WideLayout>
  );
}

/** "1 day", "12 days". */
function dayCount(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}
