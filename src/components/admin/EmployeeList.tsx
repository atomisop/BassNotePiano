"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { EmployeeRow } from "@/lib/admin";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { Meta } from "@/components/ui/CardKit";
import { StatusDot } from "@/components/ui/StatusDot";
import { toast } from "@/components/ui/Toaster";

export interface EmployeeListProps {
  employees: EmployeeRow[];
  currentUserId: string;
  /** Only the owner can revoke, so everyone else sees the list without the button. */
  canRevoke: boolean;
  onRevoke: (userId: string) => Promise<{ ok: boolean; error: string | null }>;
  /** The person just added: their row is marked new, scrolled to, and shows `settings` (their alerts) open under it. */
  openId?: string | null;
  settings?: ReactNode;
}

/** Admin accounts with a two-step revoke, same confirm pattern as the payment queue. */
export function EmployeeList({ employees, currentUserId, canRevoke: viewerCanRevoke, onRevoke, openId = null, settings }: EmployeeListProps) {
  const router = useRouter();
  const openRef = useRef<HTMLLIElement | null>(null);
  const openShown = employees.some((e) => e.id === openId);
  useEffect(() => {
    if (openShown) openRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [openShown, openId]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const hold = await toast.held("Removing their access", () => onRevoke(id));
      if (hold.undone) return;
      const result = hold.value;
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

  // People are rows in one box: the name bright, the email and role one quiet line (a role is a word, not a badge), Revoke quiet red
  // text on the right, behind its confirm. The person just added is marked New and opens their alert settings under their row.
  return (
    <div className="space-y-3">
      {error && <p className="text-small text-red-400">{error}</p>}
      <ul className="divide-y divide-slate-50/6 overflow-hidden rounded-card bg-neu-base shadow-raised-mid">
        {employees.map((employee, i) => {
          const canRevoke = viewerCanRevoke && !employee.isOwner && employee.id !== currentUserId;
          const isNew = employee.id === openId;
          return (
            <li key={employee.id} ref={isNew ? openRef : undefined} style={{ "--i": i } as import("react").CSSProperties} className="stagger-item px-4 py-3 md:px-5">
              <div className="flex min-h-10 items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-body font-semibold text-slate-50">{employee.name ?? employee.email}</h2>
                  <Meta
                    className="truncate"
                    items={[employee.name ? employee.email : null, employee.isOwner ? "Owner" : "Staff", employee.id === currentUserId ? "You" : null]}
                  />
                </div>
                {/* Just added: the one bit of news on the list, so it gets the status word. */}
                {isNew && <StatusDot tone="accent" className="ml-auto shrink-0">New</StatusDot>}
                {canRevoke && confirmingId !== employee.id && (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(employee.id)}
                    className={buttonVariants({ variant: "ghost", size: "sm", className: "shrink-0 text-red-300 hover:text-red-200" })}
                  >
                    Revoke
                  </button>
                )}
              </div>

              {isNew && settings && <div className="mt-3">{settings}</div>}

              {canRevoke && confirmingId === employee.id && (
                <div className="mt-3 space-y-3 rounded-control bg-red-400/10 p-3 ring-1 ring-inset ring-red-400/20">
                  <p className="text-small text-slate-300">
                    Remove admin access for {employee.name ?? employee.email}? They are signed out right away and become a student account.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      disabled={busyId === employee.id}
                      className={buttonVariants({ variant: "secondary", size: "sm", className: "flex-1" })}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevoke(employee.id)}
                      disabled={busyId === employee.id}
                      className={buttonVariants({ variant: "danger", size: "sm", className: "flex-1" })}
                    >
                      {busyId === employee.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                      {busyId === employee.id ? "Revoking…" : "Confirm revoke"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
