import { getServerAuthSession } from "@/lib/auth";
import { listEmployees } from "@/lib/admin";
import { ADMIN_NOTIFICATION_KINDS, getAdminNotificationSettings, isOwnerEmail } from "@/lib/adminNotifications";
import { EmployeesView } from "@/components/admin/EmployeesView";
import { getAutomations } from "@/lib/appSettings";
import { AUTOMATIONS } from "@/lib/automationKeys";
import { addStaffAction, findStaffCandidateAction, revokeEmployeeAction, setAutomationAction, setEmployeeNotificationAction } from "./actions";

export const metadata = { title: "Admin: Employees" };

export default async function AdminEmployeesPage() {
  const session = await getServerAuthSession();
  const isOwner = isOwnerEmail(session?.user.email);
  const [employees, settings, automations] = await Promise.all([listEmployees(), isOwner ? getAdminNotificationSettings() : null, isOwner ? getAutomations() : null]);

  return (
    <div>
      <h1 className="sr-only">Staff</h1>
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
          automations={isOwner && automations ? AUTOMATIONS.map(({ key, label }) => ({ key, label, enabled: automations[key] })) : null}
          onToggleAutomation={setAutomationAction}
          onFindStaff={isOwner ? findStaffCandidateAction : undefined}
          onAddStaff={isOwner ? addStaffAction : undefined}
        />
      </div>
    </div>
  );
}
