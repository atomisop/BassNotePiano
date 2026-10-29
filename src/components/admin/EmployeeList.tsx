"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EmployeeRow } from "@/lib/admin";
import { MorphingSquare } from "@/components/ui/morphing-square";

export interface EmployeeListProps {
  employees: EmployeeRow[];
  currentUserId: string;
  /** Only the owner can revoke, so everyone else sees the list without the button. */
  canRevoke: boolean;
  onRevoke: (userId: string) => Promise<{ ok: boolean; error: string | null }>;
}

/** Admin accounts with a two-step revoke, same confirm pattern as the payment queue. */
export function EmployeeList({ employees, currentUserId, canRevoke: viewerCanRevoke, onRevoke }: EmployeeListProps) {
  const router = useRouter();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const result = await onRevoke(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmingId(null);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-small text-red-400">{error}</p>}
      {employees.map((employee) => {
        const canRevoke = viewerCanRevoke && !employee.isOwner && employee.id !== currentUserId;
        return (
          <div key={employee.id} className="glass-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-body font-semibold text-slate-50">{employee.name ?? employee.email}</h2>
                <p className="mt-1 truncate text-small text-slate-500">{employee.email}</p>
                <p className="mt-1 text-small text-slate-500">
                  Joined {new Date(employee.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {employee.isOwner && (
                  <span className="rounded-full bg-slate-50/15 px-2.5 py-1 text-small font-medium uppercase tracking-wide text-slate-50">
                    Owner
                  </span>
                )}
                {employee.id === currentUserId && (
                  <span className="rounded-full bg-neu-base px-2.5 py-1 text-small font-medium uppercase tracking-wide text-slate-400 shadow-pressed-low">
                    You
                  </span>
                )}
              </div>
            </div>

            {canRevoke &&
              (confirmingId === employee.id ? (
                <div className="mt-4 space-y-2">
                  <p className="text-small text-slate-400">
                    Remove admin access for {employee.name ?? employee.email}? They are signed out right away and become a student account.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      disabled={busyId === employee.id}
                      className="tap flex-1 rounded-lg py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevoke(employee.id)}
                      disabled={busyId === employee.id}
                      className="tap flex flex-1 items-center justify-center rounded-lg bg-red-500/95 py-2 text-small font-semibold text-slate-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 shadow-raised-low active:shadow-pressed-low hover:shadow-raised-mid"
                    >
                      {busyId === employee.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                      {busyId === employee.id ? "Revoking…" : "Confirm revoke"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setConfirmingId(employee.id)}
                    className="tap w-full rounded-lg py-2 text-small font-medium text-red-300 transition bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                  >
                    Revoke admin
                  </button>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}
