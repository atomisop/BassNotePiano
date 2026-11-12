import { searchUsers, getAdminProgressOverview } from "@/lib/admin";
import { UserList, type UserListRow } from "@/components/admin/UserList";
import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { approveAllReadyScalesAction, approveNextScaleAction } from "./actions";
import { BulkConfirmButton } from "@/components/admin/BulkConfirmButton";
import { buttonVariants } from "@/components/ui/button";
import { getDoneLast7ByUser } from "@/lib/practiceActivity";
import { ACCOUNT_FOLLOW_UP_FILTERS, getFollowUpPeople, type AccountFollowUpFilter } from "@/lib/adminFollowUps";
import { sendAllFollowUpRemindersAction } from "../followup-actions";
import { bulkReminderQuestion } from "@/lib/followUpRules";
import { listDirectory } from "@/lib/contacts";
import { DirectorySection } from "@/components/admin/DirectorySection";
import { ContactForm } from "@/components/admin/ContactPanels";
import { Card } from "@/components/ui/Card";
import { CheckCheck, ClipboardList, Hourglass, Link2Off, Moon, Plus, ShieldCheck, Star, Ticket, UserPlus, Users } from "@/components/ui/appIcons";
import { FigureLead } from "@/components/admin/AdminLead";
import { createContactAction } from "../contacts/actions";
import { StaffView } from "../employees/_view";

/** The follow-up filters: one reason's people, with the same Remind all as the Follow up list. */
const FOLLOW_UP_TABS: Record<AccountFollowUpFilter, { label: string; title: string; icon: React.ReactNode; counts: string }> = {
  trial: { label: "Trial ending", title: "Trial ends within a day", icon: <Hourglass />, counts: "with a trial ending within a day" },
  credits: { label: "Credits expiring", title: "Credits expire this week", icon: <Ticket />, counts: "with credits expiring this week" },
  discord: { label: "No Discord", title: "Discord not connected", icon: <Link2Off />, counts: "not connected to Discord" },
};

export const metadata = { title: "Admin: People" };

export default async function AdminUsersPage(props: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const searchParams = await props.searchParams;
  const query = searchParams.q ?? "";
  const session = await getServerAuthSession();
  const isOwner = isOwnerEmail(session?.user?.email);
  const needsApproval = searchParams.filter === "approval";
  const notPracticing = searchParams.filter === "idle";
  const complimentary = searchParams.filter === "comped";
  // People with no account yet: the class form and the ones the studio added by hand (these two views list only them).
  const classForm = searchParams.filter === "classform";
  const added = searchParams.filter === "added";
  const contactsOnly = classForm || added;
  // Staff (the admins and their alerts) is a view of this page too, not a page of its own.
  const staff = searchParams.filter === "staff";
  const followUpFilter = (ACCOUNT_FOLLOW_UP_FILTERS as readonly string[]).includes(searchParams.filter ?? "") ? (searchParams.filter as AccountFollowUpFilter) : null;
  const followUpIds = followUpFilter ? (await getFollowUpPeople(followUpFilter)).map((p) => p.id) : undefined;
  const everyone = !needsApproval && !notPracticing && !complimentary && !followUpFilter && !contactsOnly && !staff;
  const [users, progress, noAccount] = await Promise.all([
    contactsOnly || staff ? Promise.resolve([]) : searchUsers(query, { complimentaryOnly: complimentary, onlyIds: followUpIds, all: needsApproval || notPracticing }),
    contactsOnly || staff ? Promise.resolve([]) : getAdminProgressOverview(query, { all: needsApproval || notPracticing }),
    // Under Everyone they follow the accounts; under their own pill they are the whole list.
    everyone ? listDirectory(query, "ALL").then((all) => all.filter((p) => p.kind !== "ACCOUNT")) : contactsOnly ? listDirectory(query, classForm ? "APPLICATION" : "ADDED") : Promise.resolve([]),
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
      <h1 className="sr-only">People</h1>

      <div className="md:mt-3">
        <AdminFilterTabs
          label="Show"
          iconOnly
          items={[
            { label: "Everyone", icon: <Users />, href: `/admin/users${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`, active: everyone },
            { label: "Next scale", selectLabel: "Ready for the next scale", icon: <CheckCheck />, href: `/admin/users?filter=approval${q}`, active: needsApproval },
            { label: "Not practicing", icon: <Moon />, href: `/admin/users?filter=idle${q}`, active: notPracticing },
            ...ACCOUNT_FOLLOW_UP_FILTERS.map((f) => ({ label: FOLLOW_UP_TABS[f].label, icon: FOLLOW_UP_TABS[f].icon, href: `/admin/users?filter=${f}${q}`, active: followUpFilter === f })),
            { label: "Complimentary", icon: <Star />, href: `/admin/users?filter=comped${q}`, active: complimentary },
            { label: "Class form", icon: <ClipboardList />, href: `/admin/users?filter=classform${q}`, active: classForm },
            { label: "Added", icon: <UserPlus />, href: `/admin/users?filter=added${q}`, active: added },
            { label: "Staff", icon: <ShieldCheck />, href: "/admin/users?filter=staff", active: staff },
          ]}
        />
      </div>

      {staff && <div className="mt-4"><StaffView /></div>}

      {/* Add someone who has no account (a call, a walk-in); open, the form takes its own row under the buttons. */}
      {!staff && (
      <div className="mt-4 flex flex-wrap items-start justify-end gap-2">
        {/* The list's one fact, figure first, sharing its line with the two side actions. */}
        <FigureLead
          className="mr-auto"
          figure={contactsOnly ? noAccount.length : rows.length}
          label={
            classForm
              ? "from the class form, no account yet"
              : added
                ? "added by hand, no account yet"
                : needsApproval
                  ? "ready for the next scale"
                  : notPracticing
                    ? "not practicing this week"
                    : followUpFilter
                      ? FOLLOW_UP_TABS[followUpFilter].counts
                      : complimentary
                        ? `complimentary account${rows.length === 1 ? "" : "s"}`
                        : `account${rows.length === 1 ? "" : "s"}`
          }
          meta={[query.trim() ? `Matching "${query.trim()}"` : null, everyone && noAccount.length > 0 ? `${noAccount.length} not signed up yet` : null].filter(Boolean).join(" · ") || undefined}
        />
        {isOwner && (
          <a href="/api/admin/export?type=people" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Export CSV
          </a>
        )}
        <details className="group text-right open:w-full">
          <summary className="press inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-control bg-neu-base px-3.5 text-small font-semibold text-slate-100 shadow-raised-low [&::-webkit-details-marker]:hidden">
            <Plus className="h-4 w-4" aria-hidden /> Add person
          </summary>
          <Card className="mt-3 ml-auto w-full max-w-xl text-left">
            <ContactForm submitLabel="Save" onSave={createContactAction} openAfterSave />
          </Card>
        </details>
      </div>
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

      {!contactsOnly && !staff && (
        <div className="mt-4">
          <UserList rows={rows} initialQuery={query} onApproveNext={approveNextScaleAction} />
        </div>
      )}

      {/* Everyone who has no account yet, right under the accounts (or alone under Class form and Added). */}
      {noAccount.length > 0 && (
        <section aria-label="No account yet" className="mt-8">
          {!contactsOnly && (
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 className="text-caption font-medium uppercase tracking-caps text-slate-500">Not signed up yet</h2>
              <span className="text-small tabular-nums text-slate-500">{noAccount.length}</span>
            </div>
          )}
          <div className={contactsOnly ? "mt-4" : "mt-3"}>
            <DirectorySection people={noAccount} />
          </div>
        </section>
      )}
      {contactsOnly && noAccount.length === 0 && (
        <p className="mt-5 rounded-card bg-neu-base px-4 py-8 text-center text-small text-slate-400 shadow-raised-low">
          {query.trim() ? `Nobody matches "${query.trim()}".` : classForm ? "Nobody has sent the class form yet." : "Nobody added yet. Tap Add person."}
        </p>
      )}
    </div>
  );
}
