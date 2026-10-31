import { Suspense } from "react";
import { getAttentionItems, getOverviewStats, getOverviewTrends, getSubscriptionStats } from "@/lib/admin";
import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { listAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getAdminPayments } from "@/lib/payments";
import { PaymentQueue } from "@/components/admin/PaymentQueue";
import { approvePaymentAction, checkPaymentAction, rejectPaymentAction } from "./payments/actions";
import { RemindButton } from "@/components/admin/RemindButton";
import { REMINDER_KINDS } from "@/lib/followUpReminders";
import { getFollowUps } from "@/lib/adminFollowUps";
import { getJobStatuses, isStopped } from "@/lib/jobRun";
import { AutomaticTasks } from "@/components/admin/AutomaticTasks";
import { OverviewStats } from "@/components/admin/OverviewStats";
import { MetricCard } from "@/components/ui/MetricCard";
import { PhoneAccordion } from "@/components/ui/PhoneAccordion";
import { getDueWeek } from "@/lib/adminDue";
import { ModuleHealthSection, ModuleHealthSkeleton } from "@/components/admin/ModuleHealthSection";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeRow, HomeRows } from "@/components/home/HomeRow";
import { GlanceTiles } from "@/components/home/GlanceTiles";
import { StatusDot } from "@/components/ui/StatusDot";
import { buttonVariants } from "@/components/ui/button";
import { getTeachingDay } from "@/lib/teachingToday";
import { ArrowRight, CalendarCheck, CalendarClock, Coins, CreditCard, Eye, Inbox, ListChecks, Users, Wrench } from "@/components/ui/appIcons";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Whole dollars, short: $1,240 or $12.4k. */
function formatUsdShort(cents: number) {
  const dollars = Math.round(cents / 100);
  return dollars >= 10_000 ? `$${(dollars / 1000).toFixed(1).replace(/\.0$/, "")}k` : `$${dollars.toLocaleString("en-US")}`;
}

export const metadata = { title: "Admin: Overview" };

export default async function AdminOverviewPage() {
  const [stats, trends, session, subs, attention, followUps, waiting, dueWeek] = await Promise.all([getOverviewStats(), getOverviewTrends(6), getServerAuthSession(), getSubscriptionStats(), getAttentionItems(), getFollowUps(), getAdminPayments("PENDING_REVIEW", 1), getDueWeek()]);
  const isOwner = isOwnerEmail(session?.user?.email);
  const firstName = (session?.user?.name ?? "").trim().split(/\s+/)[0] || null;
  // Revenue against last month, from the six-month trend (dollars per month): the change chip on the hero card.
  const revenueNow = trends.revenue[trends.revenue.length - 1]?.value ?? 0;
  const revenuePrev = trends.revenue[trends.revenue.length - 2]?.value ?? 0;
  const revenueDelta = revenuePrev > 0 ? Math.round(((revenueNow - revenuePrev) / revenuePrev) * 100) : null;
  const hourEt = Number(new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }));
  const greeting = hourEt < 12 ? "morning" : hourEt < 18 ? "afternoon" : "evening";
  const waitingTotal = attention.length;
  const [activity, jobs, visits] = isOwner
    ? await Promise.all([
        listAudit(20),
        getJobStatuses(),
        prisma.pageHit.groupBy({ by: ["path"], where: { day: { gte: new Date(Date.now() - 7 * 86_400_000) } }, _sum: { count: true }, orderBy: { _sum: { count: "desc" } } }),
      ])
    : [[], [], []];

  const today = await getTeachingDay();
  const classesToday = today.slots.reduce((n, slot) => n + slot.students.length, 0);
  const stoppedJobs = jobs.filter((j) => isStopped(j.state)).length;
  const pausedJobs = jobs.filter((j) => j.state === "paused").length;
  const viewsWeek = visits.reduce((n, v) => n + (v._sum.count ?? 0), 0);
  const followUpPeople = followUps.reduce((n, f) => n + f.total, 0);
  const top = attention[0] ?? null;

  /**
   * The Overview, built like Home (2026-10-30, owner: "exactly like the Home screen"): a greeting, one hero carrying the thing that
   * needs you most, the payments you can approve in place, then quiet rows. No stacking card deck here (it overlapped on phones).
   * Computer: hero and payments on the left, the rows on the right.
   */
  return (
    <div>
      {/* The greeting stays put while the page scrolls under it, like every page's heading, so it sits above both columns. */}
      <div data-deck-header className="deck-header -mt-4 pt-8 lg:pb-6">
        <p className="text-small font-medium text-slate-400">Admin</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">{firstName ? `Good ${greeting}, ${firstName}.` : "Overview"}</h1>
      </div>
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-10">
      <div className="grid min-w-0 grid-cols-1 gap-6">

        <HomeHero
          artwork="dusk"
          eyebrow={top ? `Needs you · ${waitingTotal} ${waitingTotal === 1 ? "item" : "items"}` : "Today"}
          title={top ? top.label : classesToday > 0 ? `${classesToday} ${classesToday === 1 ? "student" : "students"} in class today` : "All caught up"}
          detail={
            top
              ? waitingTotal > 1
                ? `Then ${attention
                    .slice(1, 3)
                    .map((a) => a.label.toLowerCase())
                    .join(", ")}.`
                : "That is the only thing waiting."
              : classesToday > 0
                ? "Mark attendance right on the Today screen."
                : "Nothing is waiting for you. Payments, applications and chats will show up here."
          }
          actions={
            top ? (
              <Link href={top.href} className={buttonVariants({ size: "lg" })}>
                Start here
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            ) : (
              <Link href="/admin/today" className={buttonVariants({ size: "lg" })}>
                {classesToday > 0 ? "Open today" : "See today"}
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            )
          }
        />

        <GlanceTiles
          items={[
            {
              href: top ? top.href : "/admin/payments",
              label: "Waiting",
              icon: <Inbox />,
              value: String(attention.reduce((n, a) => n + a.count, 0)),
              unit: "items",
              hint: top ? top.label : "All caught up",
              alert: waitingTotal > 0,
            },
            {
              href: "/admin/today",
              label: "Today",
              icon: <CalendarCheck />,
              value: String(classesToday),
              unit: classesToday === 1 ? "student" : "students",
              hint: today.slots.length > 0 ? `${today.slots.length} ${today.slots.length === 1 ? "class" : "classes"}` : "No classes",
            },
            {
              href: "/admin/payments",
              label: "Revenue",
              icon: <Coins />,
              value: formatUsdShort(revenueNow * 100),
              hint: revenueDelta !== null ? `${revenueDelta >= 0 ? "Up" : "Down"} ${Math.abs(revenueDelta)}% this month` : "This month",
              bars: { values: trends.revenue.map((r) => r.value), label: `Revenue, last ${trends.revenue.length} months` },
            },
          ]}
        />

        {waiting.payments.length > 0 && (
          <section aria-label="Payments to approve">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="text-title font-semibold text-slate-50">Payments to approve</h2>
              {waiting.total > 3 && (
                <Link href="/admin/payments" className="text-small text-slate-400 underline-offset-4 hover:text-slate-100 hover:underline">
                  All {waiting.total} waiting
                </Link>
              )}
            </div>
            <PaymentQueue payments={waiting.payments.slice(0, 3)} onApprove={approvePaymentAction} onReject={rejectPaymentAction} onCheck={checkPaymentAction} />
          </section>
        )}

        <section aria-label="Trends" className="hidden lg:block">
          <h2 className="mb-3 text-title font-semibold text-slate-50">Trends, last 6 months</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MetricCard label="Signups" value={stats.totalUsers.toLocaleString()} hint="All accounts" data={trends.signups} variant="bar" />
            <MetricCard label="Verified revenue" value={formatUsd(stats.totalRevenueCents)} hint="Approved payments" data={trends.revenue} variant="area" tone="success" />
          </div>
        </section>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-8">
        {attention.length > 1 && (
          <HomeRows title="Needs you" aside={`${waitingTotal} ${waitingTotal === 1 ? "item" : "items"}`}>
            {attention.map((item) => (
              <li key={`${item.href}|${item.label}`}>
                <HomeRow href={item.href} icon={<Inbox />} title={item.label} trailing={<span className="text-small font-semibold tabular-nums text-signal-fg">{item.count}</span>} />
              </li>
            ))}
          </HomeRows>
        )}

        <HomeRows title="Money">
          <li>
            <HomeRow
              href="/admin/payments"
              icon={<Coins />}
              title={formatUsd(stats.totalRevenueCents)}
              detail={
                stats.pendingRevenueCents > 0
                  ? `Verified revenue · ${formatUsd(stats.pendingRevenueCents)} waiting for review`
                  : `Verified revenue${revenueDelta !== null ? ` · ${revenueDelta >= 0 ? "up" : "down"} ${Math.abs(revenueDelta)}% this month` : ""}`
              }
            />
          </li>
          <li>
            <HomeRow href="/admin/payment-plans" icon={<CreditCard />} title={`${formatUsd(subs.monthlyCents)} every 28 days`} detail={`${subs.active} paying ${subs.active === 1 ? "subscriber" : "subscribers"}`} />
          </li>
          <li>
            <HomeRow
              href="/admin/payment-plans"
              icon={<CalendarClock />}
              title={`${formatUsd(dueWeek.totalCents)} due in 7 days`}
              detail={`${dueWeek.items.length} ${dueWeek.items.length === 1 ? "bill" : "bills"}${dueWeek.overdue.length > 0 ? ` · ${dueWeek.overdue.length} already late (${formatUsd(dueWeek.overdueCents)})` : " · no one is late"}`}
            />
          </li>
        </HomeRows>

        <HomeRows title="Studio">
          <li>
            <HomeRow href="/admin/today" icon={<CalendarCheck />} title={classesToday > 0 ? `${classesToday} in class today` : "No classes today"} detail="Mark attendance on the Today screen" />
          </li>
          <li>
            <HomeRow href="/admin/users" icon={<Users />} title={`${stats.totalUsers.toLocaleString()} accounts`} detail={`${subs.active} on a plan · ${subs.overdue} overdue`} />
          </li>
          {isOwner && (
            <>
              <li>
                <HomeRow href="/admin/activity" icon={<ListChecks />} title="Recent activity" detail={`${activity.length} recent changes`} />
              </li>
              <li>
                <HomeRow
                  href="/admin#tasks"
                  icon={<Wrench />}
                  title="Automatic tasks"
                  detail={stoppedJobs > 0 ? `${stoppedJobs} stopped` : pausedJobs > 0 ? `${pausedJobs} paused` : "All running"}
                  trailing={stoppedJobs > 0 ? <StatusDot tone="danger">Stopped</StatusDot> : undefined}
                />
              </li>
              <li>
                <HomeRow href="/admin/activity" icon={<Eye />} title={`${viewsWeek.toLocaleString()} page views`} detail="Last 7 days" />
              </li>
            </>
          )}
        </HomeRows>

        {followUps.length > 0 && (
          <HomeRows title="Follow up" aside={`${followUpPeople} ${followUpPeople === 1 ? "person" : "people"}`}>
            {followUps.map((f) => (
              <li key={f.key} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <Link href={f.href} className="text-body font-semibold text-slate-50 hover:underline">
                    {f.title}
                  </Link>
                  <span className="text-small tabular-nums text-slate-400">{f.total}</span>
                </div>
                <p className="mt-0.5 text-small text-slate-500">{f.hint}</p>
                {f.people.length > 0 && (
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-small">
                    {f.people.map((p) => (
                      <span key={p.id} className="inline-flex flex-wrap items-center gap-2">
                        <Link href={`/admin/users/${p.id}`} className="tap inline-flex items-center text-slate-300 underline decoration-slate-600 underline-offset-2 hover:text-slate-50">
                          {p.name}
                        </Link>
                        {(REMINDER_KINDS as string[]).includes(f.key) && <RemindButton kind={f.key} userId={p.id} name={p.name} />}
                      </span>
                    ))}
                    {f.total > f.people.length && <span className="text-slate-500">and {f.total - f.people.length} more</span>}
                  </p>
                )}
              </li>
            ))}
          </HomeRows>
        )}
      </div>

      {isOwner && (
        <div className="grid grid-cols-1 items-start gap-4 lg:col-span-2 lg:grid-cols-2">
          <PhoneAccordion
            id="tasks"
            alwaysCollapsible
            title="Automatic tasks"
            summary={stoppedJobs > 0 ? `${stoppedJobs} stopped` : pausedJobs > 0 ? `${pausedJobs} paused` : "All running"}
            warn={stoppedJobs > 0}
            className="glass-surface scroll-mt-20"
          >
            <AutomaticTasks
              jobs={jobs.map((j) => ({ name: j.name, state: j.state, lastRanAt: j.lastRanAt ? new Date(j.lastRanAt).toISOString() : null, note: j.note }))}
              checkedAt={new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" })}
              canPause={isOwner}
            />
          </PhoneAccordion>
          <PhoneAccordion alwaysCollapsible title="Page views, last 7 days" summary={`${viewsWeek.toLocaleString()} views`} className="glass-surface">
            {visits.length === 0 ? (
              <p className="text-small text-slate-500">No views yet.</p>
            ) : (
              <ul className="divide-y divide-slate-50/10">
                {visits.map((v) => (
                  <li key={v.path} className="flex items-center justify-between gap-3 py-2.5 text-small">
                    <span className="text-slate-200">{v.path}</span>
                    <span className="tabular-nums text-slate-400">{v._sum.count ?? 0}</span>
                  </li>
                ))}
              </ul>
            )}
          </PhoneAccordion>
        </div>
      )}

      <div className="lg:col-span-2">
        <OverviewStats stats={stats}>
          <Suspense fallback={<ModuleHealthSkeleton />}>
            <ModuleHealthSection />
          </Suspense>
        </OverviewStats>
      </div>
    </div>
    </div>
  );
}
