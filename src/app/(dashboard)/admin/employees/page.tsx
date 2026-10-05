import { getServerAuthSession } from "@/lib/auth";
import { listEmployees } from "@/lib/admin";
import { EmployeeList } from "@/components/admin/EmployeeList";
import { revokeEmployeeAction } from "./actions";

export default async function AdminEmployeesPage() {
  const session = await getServerAuthSession();
  const employees = await listEmployees();

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Employees</h1>
      <p className="mt-2 text-small text-slate-500">
        {employees.length} admin{employees.length === 1 ? "" : "s"}
      </p>

      <div className="mt-6">
        <EmployeeList employees={employees} currentUserId={session?.user.id ?? ""} onRevoke={revokeEmployeeAction} />
      </div>
    </div>
  );
}
