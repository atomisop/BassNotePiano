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
import { RefreshTasksButton } from "@/components/admin/RefreshTasksButton";
import { OverviewStats } from "@/components/admin/OverviewStats";
import { MetricCard } from "@/components/ui/MetricCard";
import { ModuleHealthSection, ModuleHealthSkeleton } from "@/components/admin/ModuleHealthSection";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export const metadata = { title: "Admin: Overview" };

export default async function AdminOverviewPage() {
  const [stats, trends, session, subs, attention, followUps, waiting] = await Promise.all([getOverviewStats(), getOverviewTrends(6), getServerAuthSession(), getSubscriptionStats(), getAttentionItems(), getFollowUps(), getAdminPayments("PENDING_REVIEW", 1)]);
  const isOwner = isOwnerEmail(session?.user?.email);
  const [activity, jobs, visits] = isOwner
    ? await Promise.all([
        listAudit(20),
        getJobStatuses(),
        prisma.pageHit.groupBy({ by: ["path"], where: { day: { gte: new Date(Date.now() - 7 * 86_400_000) } }, _sum: { count: true }, orderBy: { _sum: { count: "desc" } } }),
      ])
    : [[], [], []];

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Overview</h1>

      <section className="mt-6 rounded-2xl bg-neu-base p-4 shadow-raised-low">
        <h2 className="text-body font-semibold text-slate-50">Needs you now</h2>
        {attention.length === 0 ? (
          <p className="mt-2 text-small text-slate-500">Nothing is waiting.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-50/10">
            {attention.map((item) => (
              <li key={`${item.href}|${item.label}`}>
                <Link href={item.href} className="tap flex items-center justify-between gap-3 py-2.5 text-small transition hover:opacity-80">
                  <span className="text-slate-200">{item.label}</span>
                  <span className="rounded-full bg-[rgb(var(--signal)/0.14)] px-2.5 py-0.5 font-semibold tabular-nums text-signal-fg">{item.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {waiting.payments.length > 0 && (
        <section className="mt-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-body font-semibold text-slate-50">Approve without leaving</h2>
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
        <section className="mt-4 rounded-2xl bg-neu-base p-4 shadow-raised-low">
          <h2 className="text-body font-semibold text-slate-50">People to follow up with</h2>
          <ul className="mt-2 divide-y divide-slate-50/10">
            {followUps.map((f) => (
              <li key={f.key} className="py-2.5 text-small">
                <div className="flex items-center justify-between gap-3">
                  <Link href={f.href} className="font-medium text-slate-200 hover:underline">
                    {f.title}
                  </Link>
                  <span className="rounded-full bg-[rgb(var(--signal)/0.14)] px-2.5 py-0.5 font-semibold tabular-nums text-signal-fg">{f.total}</span>
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
        </section>
      )}

      {/* Two trend cards over the last six months, both from real rows
          (User.createdAt and VERIFIED payments). Flat stretches are real
          flat stretches, no smoothing, no seeded history. */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard
          label="Signups"
          value={stats.totalUsers.toLocaleString()}
          hint="Last 6 months"
          data={trends.signups}
          variant="bar"
        />
        <MetricCard
          label="Verified revenue"
          value={formatUsd(stats.totalRevenueCents)}
          hint={stats.pendingRevenueCents > 0 ? `${formatUsd(stats.pendingRevenueCents)} waiting for review, not counted yet` : "Last 6 months"}
          data={trends.revenue}
          variant="area"
          tone="success"
        />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Subscribers", value: String(subs.active) },
          { label: "Per month", value: formatUsd(subs.monthlyCents) },
          { label: "Due this week", value: `${subs.dueSoon} · ${formatUsd(subs.dueSoonCents)}` },
          { label: "Overdue", value: String(subs.overdue), warn: subs.overdue > 0 },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl bg-neu-base p-4 shadow-raised-low">
            <p className="text-small text-slate-500">{tile.label}</p>
            <p className={`mt-1 text-body font-semibold ${tile.warn ? "text-red-300" : "text-slate-50"}`}>{tile.value}</p>
          </div>
        ))}
      </div>

      {isOwner && (
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="glass-surface p-5">
            <h2 className="text-body font-semibold text-slate-50">Recent activity</h2>
            {activity.length === 0 ? (
              <p className="mt-3 text-small text-slate-500">Nothing yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-50/10">
                {activity.map((row) => (
                  <li key={row.id} className="py-2.5 text-small">
                    <p className="text-slate-200">
                      <span className="font-medium">{row.action}</span>
                      {row.detail ? <span className="text-slate-400"> · {row.detail}</span> : null}
                    </p>
                    <p className="mt-0.5 text-slate-500">
                      {row.actorEmail ?? "System"} · {new Date(row.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="glass-surface p-5">
            <h2 className="text-body font-semibold text-slate-50">Page views, last 7 days</h2>
            {visits.length === 0 ? (
              <p className="mt-3 text-small text-slate-500">No views yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-50/10">
                {visits.map((v) => (
                  <li key={v.path} className="flex items-center justify-between gap-3 py-2.5 text-small">
                    <span className="text-slate-200">{v.path}</span>
                    <span className="tabular-nums text-slate-400">{v._sum.count ?? 0}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section id="tasks" className="glass-surface scroll-mt-20 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-body font-semibold text-slate-50">Automatic tasks</h2>
                <p className="mt-0.5 text-small text-slate-500">
                  Checked {new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" })} ET
                </p>
              </div>
              <RefreshTasksButton />
            </div>
            <ul className="mt-3 divide-y divide-slate-50/10">
              {jobs.map((job) => {
                const bad = isStopped(job.state);
                const when = job.lastRanAt
                  ? new Date(job.lastRanAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                  : null;
                const text =
                  job.state === "never" ? "has never run" : job.state === "failed" ? `failed, ${when}` : job.state === "late" ? `late, last ran ${when}` : when ?? "not run yet";
                return (
                  <li key={job.name} className="py-2.5 text-small">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-200">{job.name}</span>
                      <span className={bad ? "text-red-300" : "text-slate-500"}>{text}</span>
                    </div>
                    {job.state === "failed" && job.note && <p className="mt-1 break-words text-red-300/80">{job.note}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}

      <div className="mt-8">
        <OverviewStats stats={stats}>
          <Suspense fallback={<ModuleHealthSkeleton />}>
            <ModuleHealthSection />
          </Suspense>
        </OverviewStats>
      </div>
    </div>
  );
}
