import { Suspense } from "react";
import Link from "next/link";
import { getAttentionItems, getOverviewStats, getRevenueSummary, getSubscriptionStats, type AttentionItem } from "@/lib/admin";
import { NeedsYouList } from "@/components/admin/NeedsYouList";
import { easternDay, todayHref } from "@/lib/teachingDayRules";
import { getFollowUps } from "@/lib/adminFollowUps";
import { buildNeedsYou } from "@/lib/needsYou";
import { getDueWeek } from "@/lib/adminDue";
import { getTeachingDay, getWeekSchedule } from "@/lib/teachingToday";
import { changeLabel } from "@/lib/revenueSummary";
import { ModuleHealthSection, ModuleHealthSkeleton } from "@/components/admin/ModuleHealthSection";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeRow } from "@/components/home/HomeRow";
import { GlanceTiles } from "@/components/home/GlanceTiles";
import { buttonVariants } from "@/components/ui/button";
import { ArrowRight, CalendarCheck, CalendarClock, CalendarDays, ChevronDown, Coins, CreditCard, PlayCircle, Users } from "@/components/ui/appIcons";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/Hint";

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

  return (
    <div>
      {/* No greeting in the admin area (owner, 2026-10-31): the pinned menu, then straight to the content. */}
      <h1 className="sr-only">Overview</h1>

      {/* Needs you: the jobs waiting right now. A row opens right here with its first few and their main action. Empty is a good day. */}
      <section aria-label="Needs you" className={needsYou.length > 0 ? "mb-8" : "mb-5"}>
        {needsYou.length > 0 && <h2 className="text-small font-medium uppercase tracking-caps text-slate-50/80">Needs you</h2>}
        {needsYou.length > 0 ? (
          <NeedsYouList rows={needsYou} />
        ) : (
          <p className="text-small text-slate-400"><Hint>Nothing needs you right now.</Hint></p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-10">
        {/* Schedule */}
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <HomeHero
            artwork="dusk"
            eyebrow="Today"
            title={classesToday > 0 ? `${classesToday} ${classesToday === 1 ? "student" : "students"} in class today` : "No classes today"}
            detail={
              upcoming
                ? `${upcoming.startsAt.getTime() > Date.now() ? "Next" : "Now"} at ${timeEt(upcoming.startsAt)}: ${upcoming.students.map((s) => s.name).join(", ")}.`
                : classesToday > 0
                  ? "Today's classes are done. Mark anyone you have not marked yet."
                  : nextDay
                    ? `Next classes ${nextDay.weekday}: ${nextDay.students} ${nextDay.students === 1 ? "student" : "students"}.`
                    : "Nothing booked in the next 7 days."
            }
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

          {/* With nothing booked, the hero already says so; the empty strip would repeat it. */}
          {weekStudents > 0 && (
          <section aria-label="The next 7 days" className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 className="text-title font-semibold text-slate-50">Next 7 days</h2>
              <span className="text-small text-slate-400">
                {weekStudents} {weekStudents === 1 ? "class" : "classes"}
              </span>
            </div>
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
                    <span className={cn("text-caption font-medium", i === 0 ? "text-signal-fg" : "text-slate-400")}>{d.weekday}</span>
                    <span className="text-body font-semibold tabular-nums text-slate-50">{d.day}</span>
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

          {today.slots.length > 0 && (
            <section aria-label="Today's classes" className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 px-1">
                <h2 className="text-title font-semibold text-slate-50">Today&apos;s classes</h2>
                <span className="text-small text-slate-400">
                  {today.slots.length} {today.slots.length === 1 ? "class" : "classes"}
                </span>
              </div>
              <ul className={PANEL}>
                {today.slots.map((slot) => (
                  <li key={slot.startsAt.toISOString()}>
                    <HomeRow
                      href="/admin/today"
                      icon={<CalendarCheck />}
                      title={timeEt(slot.startsAt)}
                      detail={slot.students.map((s) => s.name).join(", ")}
                      trailing={
                        <span className="text-small tabular-nums text-slate-400">
                          {slot.students.filter((s) => s.attendance).length}/{slot.students.length} marked
                        </span>
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Money, then how it is going */}
        <div className="grid min-w-0 grid-cols-1 gap-8">
          <section aria-label="Money" className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 className="text-title font-semibold text-slate-50">Money</h2>
              <Link href="/admin/payments" className="tap inline-flex items-center text-small text-slate-400 underline-offset-4 hover:text-slate-100 hover:underline">
                Payments
              </Link>
            </div>
            <GlanceTiles
              columns={2}
              className="mt-3"
              items={[
                {
                  href: "/admin/payments",
                  label: "This week",
                  icon: <Coins />,
                  value: formatUsdShort(revenue.weekCents),
                  hint: weekChange ? `${weekChange} vs last week` : "Last 7 days",
                  bars: { values: revenue.weeks.map((w) => w.cents), label: `Money in, each of the last ${revenue.weeks.length} weeks: ${revenue.weeks.map((w) => formatUsdShort(w.cents)).join(", ")}` },
                },
                {
                  href: "/admin/payments",
                  label: "This month",
                  icon: <CalendarDays />,
                  value: formatUsdShort(revenue.monthCents),
                  hint: monthChange ? `${monthChange} vs last month` : "So far this month",
                  bars: { values: revenue.months.map((m) => m.cents), label: `Money in, each of the last ${revenue.months.length} months: ${revenue.months.map((m) => `${m.label} ${formatUsdShort(m.cents)}`).join(", ")}` },
                },
              ]}
            />
            <ul className={PANEL}>
              <li>
                <HomeRow href="/admin/payment-plans" icon={<CreditCard />} title={`${formatUsd(subs.monthlyCents)} every 28 days`} detail={`From ${subs.active} paying ${subs.active === 1 ? "plan" : "plans"}`} />
              </li>
              <li>
                <HomeRow
                  href="/admin/payment-plans"
                  icon={<CalendarClock />}
                  title={`${formatUsd(dueWeek.totalCents)} due in 7 days`}
                  detail={`${dueWeek.items.length} ${dueWeek.items.length === 1 ? "bill" : "bills"}${dueWeek.overdue.length > 0 ? ` · ${dueWeek.overdue.length} late (${formatUsd(dueWeek.overdueCents)})` : " · no one is late"}`}
                />
              </li>
              <li>
                <HomeRow
                  href="/admin/payments"
                  icon={<Coins />}
                  title={`${formatUsd(stats.totalRevenueCents)} in all`}
                  detail={stats.pendingRevenueCents > 0 ? `Approved so far · ${formatUsd(stats.pendingRevenueCents)} waiting for review` : "Approved so far"}
                />
              </li>
            </ul>
          </section>

          <section aria-label="How it is going" className="min-w-0">
            <h2 className="px-1 text-title font-semibold text-slate-50">How it&apos;s going</h2>
            <ul className={PANEL}>
              <li>
                <HomeRow href="/admin/payment-plans" icon={<Users />} title={`${subs.active} on a plan`} detail={`${stats.totalUsers.toLocaleString()} accounts · ${subs.overdue} overdue`} />
              </li>
              <li>
                <HomeRow href="/admin/users" icon={<PlayCircle />} title={`${stats.curriculumUsers.toLocaleString()} with full lessons`} detail="Can open their scales" />
              </li>
              <li>
                {/* Progress by scale is slow to work out, so it streams in, folded away: a rough look on request. */}
                <details className="group">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3.5 px-4 py-3 transition hover:bg-slate-50/5 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-semibold text-slate-50">Progress by scale</span>
                      <span className="block text-small text-slate-400">Where everyone is, roughly</span>
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
