"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Role } from "@prisma/client";
import type { AdminUserRow } from "@/lib/admin";
import { SCALE_GROUPS } from "@/lib/curriculum";
import { MorphingSquare } from "@/components/ui/morphing-square";

export interface UserManagementTableProps {
  users: AdminUserRow[];
  initialQuery: string;
  onSetRole: (userId: string, role: Role) => Promise<void>;
  onSetCurriculumAccess: (userId: string, hasAccess: boolean) => Promise<void>;
  onToggleScale: (userId: string, scaleSlug: string, unlock: boolean) => Promise<void>;
  onClearAssistantHistory: (userId: string) => Promise<void>;
}

export function UserManagementTable({
  users,
  initialQuery,
  onSetRole,
  onSetCurriculumAccess,
  onToggleScale,
  onClearAssistantHistory,
}: UserManagementTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Role and curriculum-access changes used to fire on a single click with no
  // confirmation at all, "Make admin" included, the single highest-stakes
  // action in the whole admin panel, since an errant admin can then touch
  // every other admin tool. Clear-history used a native confirm() dialog,
  // out of place next to the custom in-place confirms used elsewhere. All
  // three now go through the same review step, one at a time per row.
  const [pendingAction, setPendingAction] = useState<{ userId: string; kind: "role" | "curriculum" | "history" } | null>(null);

  function handleSearchChange(value: string) {
    setQuery(value);
    const params = new URLSearchParams();
    if (value.trim()) params.set("q", value.trim());
    router.replace(`/admin/users${params.toString() ? `?${params}` : ""}`);
  }

  async function withBusy(userId: string, fn: () => Promise<void>) {
    setBusyId(userId);
    setError(null);
    try {
      await fn();
      router.refresh();
      setPendingAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="Search by name or email…"
        className="w-full max-w-sm glass-surface-subtle px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-[rgb(var(--c-a-400)/0.6)]"
      />

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <div className="mt-5 space-y-3">
        {users.length === 0 && (
          <div className="glass-surface p-8 text-center text-sm text-slate-500">
            No users found.
          </div>
        )}

        {users.map((user) => {
          const busy = busyId === user.id;
          return (
            <div key={user.id} className="glass-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-slate-100">{user.name ?? "—"}</p>
                  <p className="text-sm text-slate-500">{user.email}</p>
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="mt-1 inline-block text-xs font-medium text-[rgb(var(--c-a-300))] transition hover:text-[rgb(var(--c-a-200))]"
                  >
                    View full profile →
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
                      user.role === "ADMIN" ? "bg-[rgb(var(--c-a-400)/0.15)] text-[rgb(var(--c-a-300))]" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {user.role}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
                      user.hasCurriculumAccess ? "bg-emerald-400/15 text-emerald-300" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {user.hasCurriculumAccess ? "Curriculum" : "No curriculum"}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {user.scaleUnlocks.map((su) => {
                  const scaleGroup = SCALE_GROUPS.find((sg) => sg.slug === su.slug)!;
                  const state = su.completed ? "completed" : su.unlocked ? "unlocked" : "locked";
                  return (
                    <button
                      key={su.slug}
                      type="button"
                      title={`${scaleGroup.code} — ${scaleGroup.title} (${state}). Click to ${su.unlocked ? "lock" : "unlock"}.`}
                      disabled={busy}
                      onClick={() => withBusy(user.id, () => onToggleScale(user.id, su.slug, !su.unlocked))}
                      className={`h-8 min-w-[2.25rem] rounded-lg border px-2 text-xs font-medium transition disabled:opacity-40 ${
                        su.completed
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
                          : su.unlocked
                            ? "border-[rgb(var(--c-a-400)/0.3)] bg-[rgb(var(--c-a-400)/0.1)] text-[rgb(var(--c-a-300))] hover:bg-[rgb(var(--c-a-400)/0.2)]"
                            : "border-ink/10 text-slate-500 hover:border-ink/15"
                      }`}
                    >
                      S{scaleGroup.order}
                    </button>
                  );
                })}
              </div>

              {pendingAction?.userId === user.id ? (
                <div className="mt-4 space-y-2 rounded-lg border border-[rgb(var(--c-a-400)/0.3)] bg-[rgb(var(--c-a-400)/0.05)] p-3">
                  <p className="text-xs text-slate-300">
                    {pendingAction.kind === "role" &&
                      (user.role === "ADMIN"
                        ? `Remove admin access from ${user.name ?? user.email}?`
                        : `Make ${user.name ?? user.email} an admin? They'll get full access to payments, users, and every other admin tool.`)}
                    {pendingAction.kind === "curriculum" &&
                      (user.hasCurriculumAccess
                        ? `Revoke curriculum access from ${user.name ?? user.email}? They'll lose access to paid lessons immediately.`
                        : `Grant curriculum access to ${user.name ?? user.email}?`)}
                    {pendingAction.kind === "history" &&
                      `Permanently delete ${user.assistantMessageCount} stored Atom message(s) for this account? This can't be undone.`}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingAction(null)}
                      disabled={busy}
                      className="flex-1 rounded-lg border border-ink/10 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (pendingAction.kind === "role") withBusy(user.id, () => onSetRole(user.id, user.role === "ADMIN" ? "STUDENT" : "ADMIN"));
                        else if (pendingAction.kind === "curriculum") withBusy(user.id, () => onSetCurriculumAccess(user.id, !user.hasCurriculumAccess));
                        else withBusy(user.id, () => onClearAssistantHistory(user.id));
                      }}
                      disabled={busy}
                      className={`flex flex-1 items-center justify-center rounded-lg py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        pendingAction.kind === "history"
                          ? "bg-red-500/95 text-slate-950 hover:bg-red-500"
                          : "cta-sheen cta-fill"
                      }`}
                    >
                      {busy && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                      {busy ? "Applying…" : "Confirm"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPendingAction({ userId: user.id, kind: "role" })}
                    className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
                  >
                    {user.role === "ADMIN" ? "Remove admin" : "Make admin"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPendingAction({ userId: user.id, kind: "curriculum" })}
                    className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
                  >
                    {user.hasCurriculumAccess ? "Revoke curriculum" : "Grant curriculum"}
                  </button>
                  {user.assistantMessageCount > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPendingAction({ userId: user.id, kind: "history" })}
                      className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs font-medium text-red-400/80 transition hover:bg-red-400/10 disabled:opacity-40"
                    >
                      Clear Atom history ({user.assistantMessageCount})
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
