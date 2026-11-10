import { Suspense } from "react";
import Link from "next/link";
import { getAttentionItems, getOverviewStats, getRevenueSummary, getSubscriptionStats, type AttentionItem } from "@/lib/admin";
import { NeedsYouList } from "@/components/admin/NeedsYouList";
import { FollowUpMenu } from "@/components/admin/FollowUpList";
import { easternDay, todayHref } from "@/lib/teachingDayRules";
import { getFollowUps } from "@/lib/adminFollowUps";
import { buildNeedsYou } from "@/lib/needsYou";
import { getDueWeek } from "@/lib/adminDue";
import { getTeachingDay, getWeekSchedule } from "@/lib/teachingToday";
import { changeLabel } from "@/lib/revenueSummary";
import { ModuleHealthSection, ModuleHealthSkeleton } from "@/components/admin/ModuleHealthSection";
import { HomeHero } from "@/components/home/HomeHero";
import { buttonVariants } from "@/components/ui/button";
import { ArrowRight, ChevronDown, ChevronRight } from "@/components/ui/appIcons";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/Hint";
import type { ReactNode } from "react";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Whole dollars, short: $1,240 or $12.4k. */
function formatUsdShort(cents: number) {
  const dollars = Math.round(cents / 100);
  return dollars >= 10_000 ? `$${(dollars / 1000).toFixed(1).replace(/\.0$/, "")}k` : `$${dollars.toLocaleString("en-US")}`;
}

const timeEt = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

/** A titled group of rows in one soft panel (the same look as Home's rows). */
const PANEL = "mt-3 divide-y divide-slate-50/8 overflow-hidden rounded-card bg-slate-50/4 ring-1 ring-inset ring-slate-50/8";

const ROW = "group flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-slate-50/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/**
 * A section's quiet heading: a small eyebrow and, at the right, a count or a link. The hero and the money figures are the loud things on
 * the Overview (DESIGN.md, Hierarchy rules 1 and 10), so the section names step back instead of all being the same title size.
 */
function SectionHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1">
      <h2 className="text-caption font-medium uppercase tracking-caps text-slate-500">{title}</h2>
      {aside}
    </div>
  );
}

/** One row with its figure first (bright, tabular) and a quiet line under it saying what the figure is. The whole row opens its page. */
function FigureRow({ href, value, label }: { href: string; value: ReactNode; label: ReactNode }) {
  return (
    <Link href={href} className={ROW}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold tabular-nums text-slate-50">{value}</span>
        <span className="block truncate text-small text-slate-500">{label}</span>
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
    </Link>
  );
}

/** A small bar chart along the bottom of a money figure: one bar per period, the current one in full orange. */
function MiniBars({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  const at = values.length - 1;
  return (
    <span role="img" aria-label={label} className="flex h-6 items-end gap-0.5">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn("block flex-1 rounded-sm", i === at ? "bg-signal" : v > 0 ? "bg-signal/40" : "bg-slate-50/10")}
          style={{ height: `${Math.max(12, Math.round((v / max) * 100))}%` }}
        />
      ))}
    </span>
  );
}

/** A money figure: the amount is the point (big, tabular), the period a small muted word under it, then how it compares, then its bars. */
function MoneyFigure({ href, value, label, hint, bars }: { href: string; value: string; label: string; hint: string; bars: { values: number[]; label: string } }) {
  return (
    <li className="min-w-0">
      <Link
        href={href}
        className="group flex h-full min-w-0 flex-col rounded-card bg-slate-50/4 p-3 ring-1 ring-inset ring-slate-50/8 transition hover:bg-slate-50/7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
      >
        <span className="truncate text-headline font-bold leading-none tabular-nums text-slate-50">{value}</span>
        <span className="mt-1.5 truncate text-caption text-slate-500">{label}</span>
        <span className="mt-0.5 truncate text-caption text-slate-400">{hint}</span>
        <span className="mt-auto block pt-3">
          <MiniBars {...bars} />
        </span>
      </Link>
    </li>
  );
}

export const metadata = { title: "Admin: Overview" };

/**
 * The Overview (reworked 2026-10-30, owner: "what I really want to see is my schedule, how things are doing, and the money I get per
 * week and per month"): no greeting (the admin menu pins above it), the schedule (today in the hero, the next 7 days, today's classes), the money (this
 * week, this month, what comes in every 28 days, what is due) and a rough look at how students are doing. Everything else lives where
 * it belongs: automatic tasks and page views on Setup > Security, follow-ups on People > Accounts, payments to approve on Billing >
 * Payments, and what is waiting shows as dots on the admin menu and in the alerts button.
 */
export default async function AdminOverviewPage() {
  const [stats, subs, dueWeek, revenue, today, week, attention, followUps] = await Promise.all([
    getOverviewStats(),
    getSubscriptionStats(),
    getDueWeek(),
    getRevenueSummary(),
    getTeachingDay(),
    getWeekSchedule(),
    // The same list as the alerts button: ready scales, stopped tasks, payments to check and unmatched bank emails show here too.
    getAttentionItems().catch(() => [] as AttentionItem[]),
    getFollowUps().catch(() => []),
  ]);
  const needsYou = buildNeedsYou(attention, followUps);
  const todayKey = easternDay(new Date());

  const classesToday = today.slots.reduce((n, slot) => n + slot.students.length, 0);
  const upcoming = today.slots.find((s) => s.startsAt.getTime() > Date.now() - 45 * 60_000) ?? null;
  const nextDay = week.slice(1).find((d) => d.students > 0) ?? null;
  const weekStudents = week.reduce((n, d) => n + d.students, 0);
  const weekChange = changeLabel(revenue.weekCents, revenue.prevWeekCents);
  const monthChange = changeLabel(revenue.monthCents, revenue.prevMonthCents);

  // The hero names the one thing about today: the class coming up (or on now), that the day is done, or that there is none.
  const upcomingStarted = upcoming ? upcoming.startsAt.getTime() <= Date.now() : false;
  const heroTitle = upcoming
    ? upcomingStarted
      ? `In class now, ${timeEt(upcoming.startsAt)}`
      : `Next class at ${timeEt(upcoming.startsAt)}`
    : classesToday > 0
      ? "Today's classes are done"
      : "No classes today";
  const heroDetail = upcoming
    ? `${upcoming.students.map((s) => s.name).join(", ")} · ${classesToday} ${classesToday === 1 ? "student" : "students"} today`
    : classesToday > 0
      ? "Mark anyone you have not marked yet."
      : nextDay
        ? `Next classes ${nextDay.weekday}: ${nextDay.students} ${nextDay.students === 1 ? "student" : "students"}.`
        : "Nothing booked in the next 7 days.";

  return (
    <div>
      {/* No greeting in the admin area (owner, 2026-10-31): the pinned menu, then straight to the content. */}
      <h1 className="sr-only">Overview</h1>

      {/* Follow up: one button that drops down everyone who needs a nudge, grouped by reason, each with a one-tap reminder. */}
      <FollowUpMenu followUps={followUps} className="mb-5" />

      {/* Needs you: the jobs waiting right now. Each row leads with its count, so the owner reads "3" before reading what it is, and a
          row opens right here with its first few and their main action. Empty is a good day. */}
      <section aria-label="Needs you" className={needsYou.length > 0 ? "mb-8" : "mb-5"}>
        {needsYou.length > 0 && <SectionHead title="Needs you" />}
        {needsYou.length > 0 ? (
          <NeedsYouList rows={needsYou} />
        ) : (
          <p className="text-small text-slate-400"><Hint>Nothing needs you right now.</Hint></p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-10">
        {/* Schedule */}
        <div className="grid min-w-0 grid-cols-1 gap-8">
          <HomeHero
            artwork="dusk"
            eyebrow="Today"
            title={heroTitle}
            detail={heroDetail}
            actions={
              <>
                <Link href="/admin/today" className={buttonVariants({ size: "lg" })}>
                  Open today
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
                <Link href="/admin/schedule" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                  Schedule
                </Link>
              </>
            }
          />

          {/* Today's classes come straight after the hero that summarises them: the time is each row's point, the names quieter. */}
          {today.slots.length > 0 && (
            <section aria-label="Today's classes" className="min-w-0">
              <SectionHead
                title="Today's classes"
                aside={
                  <span className="text-small tabular-nums text-slate-500">
                    {today.slots.length} {today.slots.length === 1 ? "class" : "classes"}
                  </span>
                }
              />
              <ul className={PANEL}>
                {today.slots.map((slot) => {
                  const marked = slot.students.filter((s) => s.attendance).length;
                  return (
                    <li key={slot.startsAt.toISOString()}>
                      <Link href="/admin/today" className={ROW}>
                        <span className="w-20 shrink-0 text-body font-semibold tabular-nums text-slate-50">{timeEt(slot.startsAt)}</span>
                        <span className="min-w-0 flex-1 truncate text-small text-slate-400">{slot.students.map((s) => s.name).join(", ")}</span>
                        <span className={cn("shrink-0 text-small tabular-nums", marked === slot.students.length ? "text-slate-500" : "text-slate-400")}>
                          {marked}/{slot.students.length} marked
                        </span>
                        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* With nothing booked, the hero already says so; the empty strip would repeat it. */}
          {weekStudents > 0 && (
          <section aria-label="The next 7 days" className="min-w-0">
            <SectionHead
              title="Next 7 days"
              aside={
                <span className="text-small tabular-nums text-slate-500">
                  {weekStudents} {weekStudents === 1 ? "class" : "classes"}
                </span>
              }
            />
            <ul className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-2">
              {week.map((d, i) => (
                <li key={d.dayKey}>
                  <Link
                    href={todayHref(d.dayKey, todayKey)}
                    aria-label={`${d.weekday} ${d.day}: ${d.students} ${d.students === 1 ? "class" : "classes"}`}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-control py-2.5 ring-1 ring-inset transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      i === 0 ? "bg-signal/14 ring-signal/30" : "bg-slate-50/4 ring-slate-50/8 hover:bg-slate-50/7",
                    )}
                  >
                    <span className={cn("text-caption font-medium", i === 0 ? "text-signal-fg" : "text-slate-500")}>{d.weekday}</span>
                    <span className={cn("text-body font-semibold tabular-nums", d.students > 0 || i === 0 ? "text-slate-50" : "text-slate-500")}>{d.day}</span>
                    <span aria-hidden className="flex h-1.5 items-center gap-0.5">
                      {d.students === 0 ? (
                        <span className="h-1 w-1 rounded-full bg-slate-50/15" />
                      ) : (
                        Array.from({ length: Math.min(d.students, 4) }, (_, k) => <span key={k} className="h-1.5 w-1.5 rounded-full bg-signal" />)
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          )}
        </div>

        {/* Money, then how it is going */}
        <div className="grid min-w-0 grid-cols-1 gap-8">
          <section aria-label="Money" className="min-w-0">
            <SectionHead
              title="Money"
              aside={
                <Link href="/admin/payments" className="tap group inline-flex items-center gap-0.5 text-small text-slate-400 hover:text-slate-100">
                  Payments
                  <ChevronRight aria-hidden className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </Link>
              }
            />
            {/* The two figures that matter most, big and tabular, each with its period as a small word under it. */}
            <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3">
              <MoneyFigure
                href="/admin/payments"
                value={formatUsdShort(revenue.weekCents)}
                label="This week"
                hint={weekChange ? `${weekChange} vs last week` : "Last 7 days"}
                bars={{ values: revenue.weeks.map((w) => w.cents), label: `Money in, each of the last ${revenue.weeks.length} weeks: ${revenue.weeks.map((w) => formatUsdShort(w.cents)).join(", ")}` }}
              />
              <MoneyFigure
                href="/admin/payments"
                value={formatUsdShort(revenue.monthCents)}
                label="This month"
                hint={monthChange ? `${monthChange} vs last month` : "So far this month"}
                bars={{ values: revenue.months.map((m) => m.cents), label: `Money in, each of the last ${revenue.months.length} months: ${revenue.months.map((m) => `${m.label} ${formatUsdShort(m.cents)}`).join(", ")}` }}
              />
            </ul>
            <ul className={PANEL}>
              <li>
                <FigureRow href="/admin/payment-plans" value={formatUsd(subs.monthlyCents)} label={`Every 28 days, from ${subs.active} paying ${subs.active === 1 ? "plan" : "plans"}`} />
              </li>
              <li>
                <FigureRow
                  href="/admin/payment-plans"
                  value={formatUsd(dueWeek.totalCents)}
                  label={
                    <>
                      Due in 7 days, {dueWeek.items.length} {dueWeek.items.length === 1 ? "bill" : "bills"}
                      {dueWeek.overdue.length > 0 ? (
                        <span className="text-red-400"> · {dueWeek.overdue.length} late ({formatUsd(dueWeek.overdueCents)})</span>
                      ) : (
                        " · no one is late"
                      )}
                    </>
                  }
                />
              </li>
              <li>
                <FigureRow
                  href="/admin/payments"
                  value={formatUsd(stats.totalRevenueCents)}
                  label={
                    stats.pendingRevenueCents > 0 ? (
                      <>
                        All time, approved · <span className="text-amber-300">{formatUsd(stats.pendingRevenueCents)} waiting for review</span>
                      </>
                    ) : (
                      "All time, approved"
                    )
                  }
                />
              </li>
            </ul>
          </section>

          {/* A rough look, kept visibly quieter than the money above it: plain rows, no icons, no big figures. */}
          <section aria-label="How it is going" className="min-w-0">
            <SectionHead title="How it's going" />
            <ul className={PANEL}>
              <li>
                <FigureRow
                  href="/admin/payment-plans"
                  value={`${subs.active} on a plan`}
                  label={
                    <>
                      {stats.totalUsers.toLocaleString()} accounts
                      {subs.overdue > 0 ? <span className="text-red-400"> · {subs.overdue} overdue</span> : " · none overdue"}
                    </>
                  }
                />
              </li>
              <li>
                <FigureRow href="/admin/users" value={`${stats.curriculumUsers.toLocaleString()} with full lessons`} label="Can open their scales" />
              </li>
              <li>
                {/* Progress by scale is slow to work out, so it streams in, folded away: a rough look on request. */}
                <details className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-slate-50/5 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-semibold text-slate-50">Progress by scale</span>
                      <span className="block text-small text-slate-500">Where everyone is, roughly</span>
                    </span>
                    <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-4">
                    <Suspense fallback={<ModuleHealthSkeleton />}>
                      <ModuleHealthSection />
                    </Suspense>
                  </div>
                </details>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
