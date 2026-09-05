import { searchUsers } from "@/lib/admin";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { setUserRoleAction, setCurriculumAccessAction, toggleScaleUnlockAction, clearAssistantHistoryAction } from "./actions";

export default async function AdminUsersPage({ searchParams }: { searchParams: { q?: string } }) {
  const query = searchParams.q ?? "";
  const users = await searchUsers(query);

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">User management</h1>
      <p className="mt-2 text-sm text-slate-500">
        {users.length} user{users.length === 1 ? "" : "s"}
        {query ? ` matching "${query}"` : ""}.
      </p>

      <div className="mt-8">
        <UserManagementTable
          users={users}
          initialQuery={query}
          onSetRole={setUserRoleAction}
          onSetCurriculumAccess={setCurriculumAccessAction}
          onToggleScale={toggleScaleUnlockAction}
          onClearAssistantHistory={clearAssistantHistoryAction}
        />
      </div>
    </div>
  );
}
