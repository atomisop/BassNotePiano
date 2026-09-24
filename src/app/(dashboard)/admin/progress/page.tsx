import { getAdminProgressOverview } from "@/lib/admin";
import { ProgressMatrix } from "@/components/admin/ProgressMatrix";
import { toggleScaleUnlockAction } from "../users/actions";

export default async function AdminProgressPage({ searchParams }: { searchParams: { q?: string } }) {
  const query = searchParams.q ?? "";
  const rows = await getAdminProgressOverview(query);

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Progress</h1>
      <p className="mt-2 text-sm text-slate-500">
        {rows.length} student{rows.length === 1 ? "" : "s"}
        {query ? ` matching "${query}"` : ""}
      </p>

      <div className="mt-8">
        <ProgressMatrix rows={rows} initialQuery={query} onToggleScale={toggleScaleUnlockAction} />
      </div>
    </div>
  );
}
