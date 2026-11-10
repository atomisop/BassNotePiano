import { searchUsers, getAdminProgressOverview } from "@/lib/admin";
import { UserList, type UserListRow } from "@/components/admin/UserList";
import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { approveAllReadyScalesAction, approveNextScaleAction } from "./actions";
import { BulkConfirmButton } from "@/components/admin/BulkConfirmButton";
import { buttonVariants } from "@/components/ui/button";
import { getDoneLast7ByUser } from "@/lib/practiceActivity";
import { getFollowUps } from "@/lib/adminFollowUps";
import { FollowUpList } from "@/components/admin/FollowUpList";

export const metadata = { title: "Admin: Accounts" };

export default async function AdminUsersPage(props: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const searchParams = await props.searchParams;
  const query = searchParams.q ?? "";
  const session = await getServerAuthSession();
  const isOwner = isOwnerEmail(session?.user?.email);
  const needsApproval = searchParams.filter === "approval";
  const notPracticing = searchParams.filter === "idle";
  const complimentary = searchParams.filter === "comped";
  const showFollowUps = !query.trim() && !needsApproval && !notPracticing && !complimentary;
  const [users, progress, followUps] = await Promise.all([
    searchUsers(query, { complimentaryOnly: complimentary }),
    getAdminProgressOverview(query),
    showFollowUps ? getFollowUps() : Promise.resolve([]),
  ]);
  const progressById = new Map(progress.map((p) => [p.id, p]));
  // Practice is only expected from students with full access (not the admin, not a lapsed or never-paid account).
  const expectedToPractice = (id: string) => {
    const p = progressById.get(id);
    return !!p && p.hasCurriculumAccess && p.accessKind !== "ADMIN";
  };
  const doneByUser = await getDoneLast7ByUser(users.filter((u) => expectedToPractice(u.id)).map((u) => u.id));

  const rows: UserListRow[] = users
    .map((u) => {
      const p = progressById.get(u.id);
      const ready = p && p.hasCurriculumAccess && p.accessKind !== "ADMIN" && p.nextApproval.state === "READY" ? p.nextApproval.nextSlug : null;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        roleLabel: u.bannedAt ? "Banned" : u.role === "ADMIN" ? "Admin" : null,
        complimentary: u.hasCurriculumAccess && u.role !== "ADMIN",
        progress: p ? `${p.scalesCompleted}/${p.scales.length}` : null,
        readyScale: ready ? (p!.scales.find((s) => s.slug === ready)?.code ?? "next") : null,
        practiceDays: expectedToPractice(u.id) ? (doneByUser.get(u.id) ?? 0) : null,
      };
    })
    .filter((r) => !needsApproval || r.readyScale !== null)
    .filter((r) => !notPracticing || r.practiceDays === 0);

  const q = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : "";

  return (
    <div>
      <h1 className="sr-only">Accounts</h1>

      {/* Who needs a nudge, with one-tap reminders (moved here from the Overview). */}
      <FollowUpList followUps={followUps} className="mt-6" />

      <div className="mt-6">
        <AdminFilterTabs
          label="Show"
          items={[
            { label: "Everyone", href: `/admin/users${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`, active: !needsApproval && !notPracticing && !complimentary },
            { label: "Needs approval", href: `/admin/users?filter=approval${q}`, active: needsApproval },
            { label: "Not practicing", href: `/admin/users?filter=idle${q}`, active: notPracticing },
            { label: "Complimentary", href: `/admin/users?filter=comped${q}`, active: complimentary },
          ]}
        />
      </div>

      {isOwner && (
        <div className="mt-4 flex justify-end">
          <a href="/api/admin/export?type=people" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Export CSV
          </a>
        </div>
      )}

      {needsApproval && rows.length > 1 && (
        <div className="mt-4">
          <BulkConfirmButton
            label={`Approve all ${rows.length} ready`}
            question={`Release the next scale for all ${rows.length} students who are ready? Each one is told only if "Notify students" below is on. Nobody is forced past a rule.`}
            confirmLabel="Yes, approve them all"
            onConfirm={approveAllReadyScalesAction}
            notifyPlace="scales"
          />
        </div>
      )}

      <div className="mt-4">
        <UserList rows={rows} initialQuery={query} onApproveNext={approveNextScaleAction} />
      </div>
    </div>
  );
}
