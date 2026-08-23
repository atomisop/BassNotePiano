import { getOverviewStats, getModuleHealth, getOverviewTrends } from "@/lib/admin";
import { OverviewStats } from "@/components/admin/OverviewStats";
import { MetricCard } from "@/components/ui/MetricCard";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function AdminOverviewPage() {
  const [stats, moduleHealth, trends] = await Promise.all([
    getOverviewStats(),
    getModuleHealth(),
    getOverviewTrends(6),
  ]);

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Overview</h1>
      <p className="mt-2 text-sm text-slate-500">
        Platform-wide snapshot — users, revenue, and curriculum health.
      </p>

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
          hint="Last 6 months"
          data={trends.revenue}
          variant="area"
          tone="success"
        />
      </div>

      <div className="mt-8">
        <OverviewStats stats={stats} moduleHealth={moduleHealth} />
      </div>
    </div>
  );
}
