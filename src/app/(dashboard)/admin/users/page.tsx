import { searchUsers, getAdminProgressOverview } from "@/lib/admin";
import { UserList, type UserListRow } from "@/components/admin/UserList";
import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import { approveNextScaleAction } from "./actions";

export default async function AdminUsersPage({ searchParams }: { searchParams: { q?: string; filter?: string } }) {
  const query = searchParams.q ?? "";
  const needsApproval = searchParams.filter === "approval";
  const [users, progress] = await Promise.all([searchUsers(query), getAdminProgressOverview(query)]);
  const progressById = new Map(progress.map((p) => [p.id, p]));

  const rows: UserListRow[] = users
    .map((u) => {
      const p = progressById.get(u.id);
      const ready = p && p.hasCurriculumAccess && p.accessKind !== "ADMIN" && p.nextApproval.state === "READY" ? p.nextApproval.nextSlug : null;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        roleLabel: u.role === "ADMIN" ? "Admin" : null,
        progress: p ? `${p.scalesCompleted}/${p.scales.length}` : null,
        readyScale: ready ? (p!.scales.find((s) => s.slug === ready)?.code ?? "next") : null,
      };
    })
    .filter((r) => !needsApproval || r.readyScale !== null);

  const q = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : "";

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">People</h1>

      <div className="mt-6">
        <AdminFilterTabs
          label="Show"
          items={[
            { label: "Everyone", href: `/admin/users${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`, active: !needsApproval },
            { label: "Needs approval", href: `/admin/users?filter=approval${q}`, active: needsApproval },
          ]}
        />
      </div>

      <div className="mt-6">
        <UserList rows={rows} initialQuery={query} onApproveNext={approveNextScaleAction} />
      </div>
    </div>
  );
}
