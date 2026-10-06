import { getServerAuthSession } from "@/lib/auth";
import { listEmployees } from "@/lib/admin";
import { ADMIN_NOTIFICATION_KINDS, getAdminNotificationSettings, isOwnerEmail } from "@/lib/adminNotifications";
import { EmployeesView } from "@/components/admin/EmployeesView";
import { revokeEmployeeAction, setEmployeeNotificationAction } from "./actions";

export default async function AdminEmployeesPage() {
  const session = await getServerAuthSession();
  const isOwner = isOwnerEmail(session?.user.email);
  const [employees, settings] = await Promise.all([listEmployees(), isOwner ? getAdminNotificationSettings() : null]);

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Employees</h1>
      <p className="mt-2 text-small text-slate-500">
        {employees.length} admin{employees.length === 1 ? "" : "s"}
      </p>

      <div className="mt-6">
        <EmployeesView
          employees={employees}
          currentUserId={session?.user.id ?? ""}
          onRevoke={revokeEmployeeAction}
          notifications={
            isOwner && settings
              ? ADMIN_NOTIFICATION_KINDS.map(({ kind, label, group, ownerOnly }) => ({ kind, label, group, ownerOnly, owner: settings[kind].owner, employees: settings[kind].employees }))
              : null
          }
          onToggleNotification={setEmployeeNotificationAction}
        />
      </div>
    </div>
  );
}
