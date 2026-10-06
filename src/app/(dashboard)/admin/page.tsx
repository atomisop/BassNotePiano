import { Suspense } from "react";
import { getOverviewStats, getOverviewTrends, getSubscriptionStats } from "@/lib/admin";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { listAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { JOB_MAX_SILENCE_HOURS } from "@/lib/jobRun";
import { OverviewStats } from "@/components/admin/OverviewStats";
import { MetricCard } from "@/components/ui/MetricCard";
import { ModuleHealthSection, ModuleHealthSkeleton } from "@/components/admin/ModuleHealthSection";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function AdminOverviewPage() {
  const [stats, trends, session, subs] = await Promise.all([getOverviewStats(), getOverviewTrends(6), getServerAuthSession(), getSubscriptionStats()]);
  const isOwner = isOwnerEmail(session?.user?.email);
  const [activity, jobs, visits] = isOwner
    ? await Promise.all([
        listAudit(20),
        Promise.all(
          Object.keys(JOB_MAX_SILENCE_HOURS).map(async (name) => ({
            name,
            last: await prisma.jobRun.findFirst({ where: { name }, orderBy: { ranAt: "desc" }, select: { ranAt: true, ok: true } }),
          })),
        ),
        prisma.pageHit.groupBy({ by: ["path"], where: { day: { gte: new Date(Date.now() - 7 * 86_400_000) } }, _sum: { count: true }, orderBy: { _sum: { count: "desc" } } }),
      ])
    : [[], [], []];

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Overview</h1>

      {/* Two trend cards over the last six months, both from real rows
          (User.createdAt and VERIFIED payments). Flat stretches are real
          flat stretches — no smoothing, no seeded history. */}
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
          <section className="glass-surface p-5">
            <h2 className="text-body font-semibold text-slate-50">Scheduled jobs</h2>
            <ul className="mt-3 divide-y divide-slate-50/10">
              {jobs.map(({ name, last }) => {
                const late = last ? Date.now() - last.ranAt.getTime() > JOB_MAX_SILENCE_HOURS[name] * 3_600_000 : false;
                const bad = last ? !last.ok || late : false;
                return (
                  <li key={name} className="flex items-center justify-between gap-3 py-2.5 text-small">
                    <span className="text-slate-200">{name}</span>
                    <span className={bad ? "text-red-300" : "text-slate-500"}>
                      {last
                        ? `${last.ok ? "" : "failed, "}${new Date(last.ranAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                        : "not run yet"}
                    </span>
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
