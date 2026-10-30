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
import { Chip, HeroCard, LimitCard, MiniStats, ShowCard } from "@/components/dashboard/FinanceCards";
import { DueThisWeek } from "@/components/admin/DueThisWeek";
import { getDueWeek } from "@/lib/adminDue";
import { ModuleHealthSection, ModuleHealthSkeleton } from "@/components/admin/ModuleHealthSection";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
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

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">{firstName ? `Good ${greeting}, ${firstName}.` : "Overview"}</h1>

      {/* Left: the money story in four cards. Right: what needs you and who owes what this week. One column on phones. */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <div className="grid min-w-0 gap-4">
          <HeroCard
            eyebrow="Verified revenue"
            title={formatUsd(stats.totalRevenueCents)}
            detail={stats.pendingRevenueCents > 0 ? `${formatUsd(stats.pendingRevenueCents)} waiting for review, not counted yet` : "Every payment you have approved so far"}
            chip={revenueDelta !== null ? <Chip tone={revenueDelta >= 0 ? "up" : "down"}>{revenueDelta >= 0 ? "↑" : "↓"} {Math.abs(revenueDelta)}% this month</Chip> : undefined}
            primary={{ href: "/admin/payments", label: waiting.total > 0 ? `Review payments (${waiting.total})` : "Payments" }}
            secondary={{ href: "/admin/payment-plans", label: "Plans" }}
          />
          <MiniStats
            title="Subscribers"
            note={`${subs.active} active`}
            items={[
              { label: "Paying", value: String(subs.active), status: "Active", on: subs.active > 0 },
              { label: "Per 28 days", value: formatUsd(subs.monthlyCents), status: "Recurring", on: subs.monthlyCents > 0 },
              { label: "Overdue", value: String(subs.overdue), status: subs.overdue > 0 ? "Late" : "On time", on: false },
            ]}
          />
          <LimitCard
            title="Subscribers up to date"
            done={`${Math.max(0, subs.active - subs.overdue)} paid up`}
            goal={`${subs.active} subscribers`}
            fraction={subs.active > 0 ? (subs.active - subs.overdue) / subs.active : 1}
            label="Share of subscribers with no overdue bill"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <ShowCard
              tone="dark"
              title="Needs you"
              chip={waitingTotal > 0 ? "Open" : "Clear"}
              big={waitingTotal > 0 ? `${waitingTotal} ${waitingTotal === 1 ? "item" : "items"} waiting` : "Nothing waiting"}
              sub={attention[0]?.label}
              action={attention[0] ? { href: attention[0].href, label: "Start here" } : undefined}
            />
            <ShowCard
              tone="orange"
              title="Due in 7 days"
              chip={`${dueWeek.items.length} ${dueWeek.items.length === 1 ? "bill" : "bills"}`}
              big={formatUsd(dueWeek.totalCents)}
              sub={dueWeek.overdue.length > 0 ? `${dueWeek.overdue.length} already late (${formatUsd(dueWeek.overdueCents)})` : "No one is late"}
              action={{ href: "/admin/payment-plans", label: "See plans" }}
            />
          </div>
        </div>

        <div className="grid min-w-0 gap-6">
          <section aria-label="Needs you now" className="rounded-2xl bg-neu-base shadow-raised-mid p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-title font-semibold text-slate-50">Needs you now</h2>
              <p className="text-small text-slate-500">{attention.length === 0 ? "Nothing waiting" : `${attention.length} ${attention.length === 1 ? "item" : "items"}`}</p>
            </div>
            {attention.length === 0 ? (
              <p className="mt-2 text-small text-slate-500">Nothing is waiting.</p>
            ) : (
              <ul className="mt-2 divide-y divide-(--neu-edge)">
                {attention.map((item) => (
                  <li key={`${item.href}|${item.label}`}>
                    <Link href={item.href} className="tap flex items-center justify-between gap-3 py-2.5 text-small transition hover:opacity-80">
                      <span className="text-slate-200">{item.label}</span>
                      <Chip tone="orange">{item.count}</Chip>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <DueThisWeek week={dueWeek} />
        </div>
      </div>

      {waiting.payments.length > 0 && (
        <section className="mt-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-title font-semibold text-slate-50">Approve without leaving</h2>
            {waiting.total > 3 && (
              <Link href="/admin/payments" className="text-small text-slate-400 underline-offset-4 hover:text-slate-100 hover:underline">
                All {waiting.total} waiting
              </Link>
            )}
          </div>
          <PaymentQueue payments={waiting.payments.slice(0, 3)} onApprove={approvePaymentAction} onReject={rejectPaymentAction} onCheck={checkPaymentAction} />
        </section>
      )}

      {followUps.length > 0 && (
        <PhoneAccordion alwaysCollapsible title="People to follow up with" summary={`${followUps.length} to follow up`} className="mt-4 rounded-2xl bg-neu-base shadow-raised-low">
          <ul className="divide-y divide-slate-50/10">
            {followUps.map((f) => (
              <li key={f.key} className="py-2.5 text-small">
                <div className="flex items-center justify-between gap-3">
                  <Link href={f.href} className="font-medium text-slate-200 hover:underline">
                    {f.title}
                  </Link>
                  <span className="rounded-full bg-signal/14 px-2.5 py-0.5 font-semibold tabular-nums text-signal-fg">{f.total}</span>
                </div>
                <p className="mt-0.5 text-slate-500">{f.hint}</p>
                {f.people.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
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
          </ul>
        </PhoneAccordion>
      )}

      {/* Two trend cards over the last six months, both from real rows (User.createdAt and VERIFIED payments). Flat stretches are real flat
          stretches, no smoothing, no seeded history. */}
      <section aria-label="Trends" className="mt-6">
        <h2 className="mb-3 text-title font-semibold text-slate-50">Trends, last 6 months</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MetricCard label="Signups" value={stats.totalUsers.toLocaleString()} hint="All accounts" data={trends.signups} variant="bar" />
          <MetricCard label="Verified revenue" value={formatUsd(stats.totalRevenueCents)} hint="Approved payments" data={trends.revenue} variant="area" tone="success" />
        </div>
      </section>

      {isOwner && (
        <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <PhoneAccordion alwaysCollapsible title="Recent activity" summary={`${activity.length} changes`} className="glass-surface">
            {activity.length === 0 ? (
              <p className="text-small text-slate-500">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-slate-50/10">
                {activity.map((row) => (
                  <li key={row.id} className="py-2.5 text-small">
                    <p className="text-slate-200">
                      <span className="font-medium">{row.action}</span>
                      {row.detail ? <span className="text-slate-400"> · {row.detail}</span> : null}
                    </p>
                    <p className="mt-0.5 text-slate-500">
                      {row.actorEmail ?? "System"} · {new Date(row.createdAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </PhoneAccordion>
          <PhoneAccordion alwaysCollapsible title="Page views, last 7 days" summary={`${visits.reduce((n, v) => n + (v._sum.count ?? 0), 0).toLocaleString()} views`} className="glass-surface">
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
          <PhoneAccordion
            id="tasks"
            alwaysCollapsible
            title="Automatic tasks"
            summary={jobs.filter((j) => isStopped(j.state)).length > 0 ? `${jobs.filter((j) => isStopped(j.state)).length} stopped` : jobs.some((j) => j.state === "paused") ? `${jobs.filter((j) => j.state === "paused").length} paused` : "All running"}
            warn={jobs.some((j) => isStopped(j.state))}
            className="glass-surface scroll-mt-20"
          >
            <AutomaticTasks
              jobs={jobs.map((j) => ({ name: j.name, state: j.state, lastRanAt: j.lastRanAt ? new Date(j.lastRanAt).toISOString() : null, note: j.note }))}
              checkedAt={new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" })}
              canPause={isOwner}
            />
          </PhoneAccordion>
        </div>
      )}

      <div className="mt-4">
        <OverviewStats stats={stats}>
          <Suspense fallback={<ModuleHealthSkeleton />}>
            <ModuleHealthSection />
          </Suspense>
        </OverviewStats>
      </div>
    </div>
  );
}
