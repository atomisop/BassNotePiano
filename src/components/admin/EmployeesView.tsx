"use client";

import { useEffect, useState } from "react";
import type { EmployeeRow } from "@/lib/admin";
import { ADMIN_NOTIFICATION_GROUPS, type AdminNotificationGroup, type AdminNotificationKind } from "@/lib/adminNotifications";
import { EmployeeList } from "@/components/admin/EmployeeList";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/Tabs";

export interface NotificationRow {
  kind: AdminNotificationKind;
  label: string;
  group: AdminNotificationGroup;
  /** Employees never get these. */
  ownerOnly: boolean;
  owner: boolean;
  employees: boolean;
}

interface EmployeesViewProps {
  employees: EmployeeRow[];
  currentUserId: string;
  onRevoke: (userId: string) => Promise<{ ok: boolean; error: string | null }>;
  /** Null for everyone but the owner, who is the only one that sees the Notifications tab. */
  notifications: NotificationRow[] | null;
  onToggleNotification: (kind: AdminNotificationKind, who: "owner" | "employees", enabled: boolean) => Promise<{ ok: boolean; error: string | null }>;
}

export function EmployeesView({ employees, currentUserId, onRevoke, notifications, onToggleNotification }: EmployeesViewProps) {
  const [tab, setTab] = useState<"ADMINS" | "NOTIFICATIONS">("ADMINS");
  const toKey = (kind: string, who: "owner" | "employees") => `${kind}:${who}`;
  const initialValues = () =>
    Object.fromEntries((notifications ?? []).flatMap((row) => [[toKey(row.kind, "owner"), row.owner], [toKey(row.kind, "employees"), row.employees]]));
  const [values, setValues] = useState<Record<string, boolean>>(initialValues);
  const [error, setError] = useState<string | null>(null);

  // Pick up changes made elsewhere (another tab, another device) when the page data refreshes.
  const signature = (notifications ?? []).map((row) => `${row.kind}:${row.owner}:${row.employees}`).join(",");
  useEffect(() => {
    setValues(initialValues());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  async function handleToggle(kind: AdminNotificationKind, who: "owner" | "employees", enabled: boolean) {
    const key = toKey(kind, who);
    setValues((current) => ({ ...current, [key]: enabled }));
    setError(null);
    const result = await onToggleNotification(kind, who, enabled);
    if (!result.ok) {
      setValues((current) => ({ ...current, [key]: !enabled }));
      setError(result.error);
    }
  }

  return (
    <div className="space-y-5">
      {notifications && (
        <Tabs<"ADMINS" | "NOTIFICATIONS">
          label="Employees"
          value={tab}
          onChange={setTab}
          items={[
            { id: "ADMINS", label: "Admins" },
            { id: "NOTIFICATIONS", label: "Notifications" },
          ]}
        />
      )}

      {tab === "ADMINS" || !notifications ? (
        <EmployeeList employees={employees} currentUserId={currentUserId} canRevoke={notifications !== null} onRevoke={onRevoke} />
      ) : (
        <div className="space-y-5">
          {error && <p className="text-small text-red-400">{error}</p>}
          {ADMIN_NOTIFICATION_GROUPS.map((group) => {
            const rows = notifications.filter((row) => row.group === group);
            if (rows.length === 0) return null;
            return (
              <section key={group} className="glass-surface p-2">
                <div className="flex items-center justify-between gap-4 px-3 pb-1 pt-2">
                  <h2 className="text-small font-semibold text-slate-100">{group}</h2>
                  <div className="flex shrink-0 gap-6 text-small text-slate-500">
                    <span className="w-11 text-center">You</span>
                    <span className="w-11 text-center">Staff</span>
                  </div>
                </div>
                <div className="divide-y divide-[rgb(var(--c-s-50)/0.08)]">
                  {rows.map((row) => (
                    <div key={row.kind} className="flex items-center justify-between gap-4 px-3 py-3.5">
                      <p className="text-small text-slate-200">{row.label}</p>
                      <div className="flex shrink-0 items-center gap-6">
                        <div className="flex w-11 justify-center">
                          <Switch checked={values[toKey(row.kind, "owner")]} onCheckedChange={(v) => handleToggle(row.kind, "owner", v)} aria-label={`${row.label}, for you`} />
                        </div>
                        <div className="flex w-11 justify-center">
                          {row.ownerOnly ? (
                            <span className="text-small text-slate-600">Never</span>
                          ) : (
                            <Switch checked={values[toKey(row.kind, "employees")]} onCheckedChange={(v) => handleToggle(row.kind, "employees", v)} aria-label={`${row.label}, for staff`} />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
