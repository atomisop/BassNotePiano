import { getOverviewStats, getModuleHealth } from "@/lib/admin";
import { OverviewStats } from "@/components/admin/OverviewStats";

export default async function AdminOverviewPage() {
  const [stats, moduleHealth] = await Promise.all([getOverviewStats(), getModuleHealth()]);

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Overview</h1>
      <p className="mt-2 text-sm text-slate-500">Platform-wide snapshot — users, revenue, and curriculum health.</p>

      <div className="mt-8">
        <OverviewStats stats={stats} moduleHealth={moduleHealth} />
      </div>
    </div>
  );
}
