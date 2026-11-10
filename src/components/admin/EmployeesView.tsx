"use client";

import { useEffect, useState } from "react";
import type { EmployeeRow } from "@/lib/admin";
import type { AutomationKey } from "@/lib/automationKeys";
import { ADMIN_NOTIFICATION_GROUPS, type AdminNotificationGroup, type AdminNotificationKind } from "@/lib/adminNotificationKinds";
import { EmployeeList } from "@/components/admin/EmployeeList";
import { AddStaffPanel } from "@/components/admin/AddStaffPanel";
import type { StaffLookup } from "@/lib/staffAdd";
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

export interface AutomationRow {
  key: AutomationKey;
  label: string;
  enabled: boolean;
}

interface EmployeesViewProps {
  employees: EmployeeRow[];
  currentUserId: string;
  onRevoke: (userId: string) => Promise<{ ok: boolean; error: string | null }>;
  /** Null for everyone but the owner, who is the only one that sees the Notifications tab. */
  notifications: NotificationRow[] | null;
  /** Null for everyone but the owner. */
  automations: AutomationRow[] | null;
  onToggleAutomation: (key: AutomationKey, enabled: boolean) => Promise<{ ok: boolean; error: string | null }>;
  onToggleNotification: (kind: AdminNotificationKind, who: "owner" | "employees", enabled: boolean) => Promise<{ ok: boolean; error: string | null }>;
  /** Owner only ("Add staff"); absent for everyone else. */
  onFindStaff?: (email: string) => Promise<StaffLookup>;
  onAddStaff?: (userId: string, idempotencyKey?: string) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
}

export function EmployeesView({ employees, currentUserId, onRevoke, notifications, onToggleNotification, automations, onToggleAutomation, onFindStaff, onAddStaff }: EmployeesViewProps) {
  const [tab, setTab] = useState<"ADMINS" | "NOTIFICATIONS" | "AUTOMATION">("ADMINS");
  // The person just added: their row shows the staff alerts open, so the owner sets them without going to another tab.
  const [addedId, setAddedId] = useState<string | null>(null);
  const [autoValues, setAutoValues] = useState<Record<string, boolean>>(Object.fromEntries((automations ?? []).map((a) => [a.key, a.enabled])));
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
        <Tabs<"ADMINS" | "NOTIFICATIONS" | "AUTOMATION">
          label="Employees"
          value={tab}
          onChange={setTab}
          items={[
            { id: "ADMINS", label: "Admins" },
            { id: "NOTIFICATIONS", label: "Notifications" },
            { id: "AUTOMATION", label: "Automation" },
          ]}
        />
      )}

      {tab === "AUTOMATION" && automations ? (
        <div className="glass-surface divide-y divide-slate-50/8 p-2">
          {error && <p className="px-3 py-2 text-small text-red-400">{error}</p>}
          {automations.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 px-3 py-3.5">
              <p className="text-small text-slate-200">{row.label}</p>
              <Switch
                checked={autoValues[row.key]}
                onCheckedChange={async (value) => {
                  setAutoValues((current) => ({ ...current, [row.key]: value }));
                  setError(null);
                  const result = await onToggleAutomation(row.key, value);
                  if (!result.ok) {
                    setAutoValues((current) => ({ ...current, [row.key]: !value }));
                    setError(result.error);
                  }
                }}
                aria-label={row.label}
              />
            </div>
          ))}
        </div>
      ) : tab === "ADMINS" || !notifications ? (
        <div className="space-y-3">
          {notifications && onFindStaff && onAddStaff && <AddStaffPanel onFind={onFindStaff} onAdd={onAddStaff} onAdded={setAddedId} />}
          <EmployeeList
            employees={employees}
            currentUserId={currentUserId}
            canRevoke={notifications !== null}
            onRevoke={onRevoke}
            openId={addedId}
            settings={
              notifications && (
                <div className="rounded-xl bg-neu-lift p-2">
                  <div className="flex items-center justify-between gap-3 px-3 pb-1 pt-2">
                    <h3 className="text-small font-semibold text-slate-100">Their alerts</h3>
                    <button type="button" onClick={() => setAddedId(null)} className="tap inline-flex items-center text-small text-slate-400 hover:text-slate-100">
                      Done
                    </button>
                  </div>
                  <p className="px-3 text-caption text-slate-500">Everyone on staff shares these.</p>
                  {error && <p className="px-3 py-2 text-small text-red-400">{error}</p>}
                  <div className="divide-y divide-slate-50/8">
                    {notifications
                      .filter((row) => !row.ownerOnly)
                      .map((row) => (
                        <div key={row.kind} className="flex items-center justify-between gap-4 px-3 py-3">
                          <p className="text-small text-slate-200">{row.label}</p>
                          <Switch checked={values[toKey(row.kind, "employees")]} onCheckedChange={(v) => handleToggle(row.kind, "employees", v)} aria-label={`${row.label}, for staff`} />
                        </div>
                      ))}
                  </div>
                </div>
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          {error && <p className="text-small text-red-400">{error}</p>}
          {ADMIN_NOTIFICATION_GROUPS.map((group) => {
            const rows = notifications.filter((row) => row.group === group);
            if (rows.length === 0) return null;
            return (
              <section key={group} className="glass-surface p-2">
                <div className="flex items-center justify-between gap-4 px-3 pb-1 pt-2">
                  <h2 className="text-caption font-medium uppercase tracking-caps text-slate-500">{group}</h2>
                  <div className="flex shrink-0 gap-6 text-caption text-slate-500">
                    <span className="w-11 text-center">You</span>
                    <span className="w-11 text-center">Staff</span>
                  </div>
                </div>
                <div className="divide-y divide-slate-50/8">
                  {rows.map((row) => (
                    <div key={row.kind} className="flex items-center justify-between gap-4 px-3 py-3.5">
                      <p className="text-small text-slate-200">{row.label}</p>
                      <div className="flex shrink-0 items-center gap-6">
                        <div className="flex w-11 justify-center">
                          <Switch checked={values[toKey(row.kind, "owner")]} onCheckedChange={(v) => handleToggle(row.kind, "owner", v)} aria-label={`${row.label}, for you`} />
                        </div>
                        <div className="flex w-11 justify-center">
                          {row.ownerOnly ? (
                            <span className="text-small text-slate-500">Never</span>
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
