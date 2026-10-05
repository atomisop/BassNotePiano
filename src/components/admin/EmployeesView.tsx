"use client";

import { useState } from "react";
import type { EmployeeRow } from "@/lib/admin";
import type { AdminNotificationKind } from "@/lib/adminNotifications";
import { EmployeeList } from "@/components/admin/EmployeeList";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/Tabs";

export interface NotificationRow {
  kind: AdminNotificationKind;
  label: string;
  enabled: boolean;
}

interface EmployeesViewProps {
  employees: EmployeeRow[];
  currentUserId: string;
  onRevoke: (userId: string) => Promise<{ ok: boolean; error: string | null }>;
  /** Null for everyone but the owner, who is the only one that sees the Notifications tab. */
  notifications: NotificationRow[] | null;
  onToggleNotification: (kind: AdminNotificationKind, enabled: boolean) => Promise<{ ok: boolean; error: string | null }>;
}

export function EmployeesView({ employees, currentUserId, onRevoke, notifications, onToggleNotification }: EmployeesViewProps) {
  const [tab, setTab] = useState<"ADMINS" | "NOTIFICATIONS">("ADMINS");
  const [values, setValues] = useState<Record<string, boolean>>(
    Object.fromEntries((notifications ?? []).map((row) => [row.kind, row.enabled])),
  );
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(kind: AdminNotificationKind, enabled: boolean) {
    setValues((current) => ({ ...current, [kind]: enabled }));
    setError(null);
    const result = await onToggleNotification(kind, enabled);
    if (!result.ok) {
      setValues((current) => ({ ...current, [kind]: !enabled }));
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
        <EmployeeList employees={employees} currentUserId={currentUserId} onRevoke={onRevoke} />
      ) : (
        <div className="glass-surface divide-y divide-[rgb(var(--c-s-50)/0.08)] p-2">
          {error && <p className="px-3 py-2 text-small text-red-400">{error}</p>}
          {notifications.map((row) => (
            <div key={row.kind} className="flex items-center justify-between gap-4 px-3 py-3.5">
              <p className="text-small text-slate-200">{row.label}</p>
              <Switch checked={values[row.kind]} onCheckedChange={(value) => handleToggle(row.kind, value)} aria-label={row.label} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
