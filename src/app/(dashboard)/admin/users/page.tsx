import { searchUsers, getAdminProgressOverview } from "@/lib/admin";
import { UserList, type UserListRow } from "@/components/admin/UserList";
import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { approveAllReadyScalesAction, approveNextScaleAction } from "./actions";
import { BulkConfirmButton } from "@/components/admin/BulkConfirmButton";
import { buttonVariants } from "@/components/ui/button";
import { getDoneLast7ByUser } from "@/lib/practiceActivity";
import { ACCOUNT_FOLLOW_UP_FILTERS, getFollowUpPeople, getFollowUps, type AccountFollowUpFilter } from "@/lib/adminFollowUps";
import { FollowUpList } from "@/components/admin/FollowUpList";
import { sendAllFollowUpRemindersAction } from "../followup-actions";
import { bulkReminderQuestion } from "@/lib/followUpRules";

/** The follow-up filters: one reason's people, with the same Remind all as the Follow up list. */
const FOLLOW_UP_TABS: Record<AccountFollowUpFilter, { label: string; title: string }> = {
  trial: { label: "Trial ending", title: "Trial ends within a day" },
  credits: { label: "Credits expiring", title: "Credits expire this week" },
  discord: { label: "No Discord", title: "Discord not connected" },
};

export const metadata = { title: "Admin: Accounts" };

export default async function AdminUsersPage(props: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const searchParams = await props.searchParams;
  const query = searchParams.q ?? "";
  const session = await getServerAuthSession();
  const isOwner = isOwnerEmail(session?.user?.email);
  const needsApproval = searchParams.filter === "approval";
  const notPracticing = searchParams.filter === "idle";
  const complimentary = searchParams.filter === "comped";
  const followUpFilter = (ACCOUNT_FOLLOW_UP_FILTERS as readonly string[]).includes(searchParams.filter ?? "") ? (searchParams.filter as AccountFollowUpFilter) : null;
  const followUpIds = followUpFilter ? (await getFollowUpPeople(followUpFilter)).map((p) => p.id) : undefined;
  const showFollowUps = !query.trim() && !needsApproval && !notPracticing && !complimentary && !followUpFilter;
  const [users, progress, followUps] = await Promise.all([
    searchUsers(query, { complimentaryOnly: complimentary, onlyIds: followUpIds }),
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
            { label: "Everyone", href: `/admin/users${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`, active: !needsApproval && !notPracticing && !complimentary && !followUpFilter },
            { label: "Needs approval", href: `/admin/users?filter=approval${q}`, active: needsApproval },
            { label: "Not practicing", href: `/admin/users?filter=idle${q}`, active: notPracticing },
            ...ACCOUNT_FOLLOW_UP_FILTERS.map((f) => ({ label: FOLLOW_UP_TABS[f].label, href: `/admin/users?filter=${f}${q}`, active: followUpFilter === f })),
            { label: "Complimentary", href: `/admin/users?filter=comped${q}`, active: complimentary },
          ]}
        />
      </div>

      {isOwner && (
        <a href="/api/admin/export?type=people" className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-6" })}>
          Export CSV
        </a>
      )}

      {followUpFilter && followUpIds && followUpIds.length > 0 && (
        <div className="mt-6">
          <BulkConfirmButton
            label={followUpIds.length === 1 ? "Remind them" : `Remind all ${followUpIds.length}`}
            question={bulkReminderQuestion(followUpFilter, followUpIds.length, FOLLOW_UP_TABS[followUpFilter].title)}
            confirmLabel="Yes, remind them"
            onConfirm={sendAllFollowUpRemindersAction.bind(null, followUpFilter)}
          />
        </div>
      )}

      {needsApproval && rows.length > 1 && (
        <div className="mt-6">
          <BulkConfirmButton
            label={`Approve all ${rows.length} ready`}
            question={`Release the next scale for all ${rows.length} students who are ready? Each one is told only if "Notify students" below is on. Nobody is forced past a rule.`}
            confirmLabel="Yes, approve them all"
            onConfirm={approveAllReadyScalesAction}
            notifyPlace="scales"
          />
        </div>
      )}

      <div className="mt-6">
        <UserList rows={rows} initialQuery={query} onApproveNext={approveNextScaleAction} />
      </div>
    </div>
  );
}
