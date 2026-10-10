import { searchUsers, getAdminProgressOverview } from "@/lib/admin";
import { UserList, type UserListRow } from "@/components/admin/UserList";
import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { approveAllReadyScalesAction, approveNextScaleAction } from "./actions";
import { BulkConfirmButton } from "@/components/admin/BulkConfirmButton";

export const metadata = { title: "Admin: People" };

export default async function AdminUsersPage({ searchParams }: { searchParams: { q?: string; filter?: string } }) {
  const query = searchParams.q ?? "";
  const session = await getServerAuthSession();
  const isOwner = isOwnerEmail(session?.user?.email);
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
        roleLabel: u.bannedAt ? "Banned" : u.role === "ADMIN" ? "Admin" : null,
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

      {isOwner && (
        <a href="/api/admin/export?type=people" className="tap neu-btn mt-6 inline-flex items-center rounded-lg px-3 py-1.5 text-small font-medium">
          Export CSV
        </a>
      )}

      {needsApproval && rows.length > 1 && (
        <div className="mt-6">
          <BulkConfirmButton
            label={`Approve all ${rows.length} ready`}
            question={`Release the next scale for all ${rows.length} students who are ready? Each one is told right away. Nobody is forced past a rule.`}
            confirmLabel="Yes, approve them all"
            onConfirm={approveAllReadyScalesAction}
          />
        </div>
      )}

      <div className="mt-6">
        <UserList rows={rows} initialQuery={query} onApproveNext={approveNextScaleAction} />
      </div>
    </div>
  );
}
