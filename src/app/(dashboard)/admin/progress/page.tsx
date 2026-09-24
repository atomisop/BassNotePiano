import { getAdminProgressOverview } from "@/lib/admin";
import { ProgressMatrix } from "@/components/admin/ProgressMatrix";
import { toggleScaleUnlockAction } from "../users/actions";

// Absorbed the old, now-removed /admin/roster page's own two headline
// figures (curriculum access count, active-this-week count) — same
// students, same underlying rows this page already fetches, so there was
// no reason for those two counts to live on a separate page from the
// per-scale detail they summarize.
export default async function AdminProgressPage({ searchParams }: { searchParams: { q?: string } }) {
  const query = searchParams.q ?? "";
  const rows = await getAdminProgressOverview(query);

  const withAccess = rows.filter((r) => r.hasCurriculumAccess).length;
  const activeThisWeek = rows.filter((r) => r.lastActivityAt !== null && Date.now() - r.lastActivityAt < 7 * 86_400_000).length;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Progress</h1>
      <p className="mt-2 text-sm text-slate-500">
        {rows.length} student{rows.length === 1 ? "" : "s"}
        {query ? ` matching "${query}"` : ""} · {withAccess} with curriculum access · {activeThisWeek} active this week
      </p>

      <div className="mt-8">
        <ProgressMatrix rows={rows} initialQuery={query} onToggleScale={toggleScaleUnlockAction} />
      </div>
    </div>
  );
}
