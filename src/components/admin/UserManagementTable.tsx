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
  onBulkSetCurriculumAccess: (userIds: string[], hasAccess: boolean) => Promise<number>;
  onToggleScale: (userId: string, scaleSlug: string, unlock: boolean) => Promise<void>;
  onClearAssistantHistory: (userId: string) => Promise<void>;
}

export function UserManagementTable({
  users,
  initialQuery,
  onSetRole,
  onSetCurriculumAccess,
  onBulkSetCurriculumAccess,
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

  // Bulk selection. A bulk change always goes through a confirm step that
  // names how many people it affects.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState<boolean | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const allSelected = users.length > 0 && users.every((u) => selected.has(u.id));

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBulk(hasAccess: boolean) {
    setBulkBusy(true);
    setError(null);
    try {
      await onBulkSetCurriculumAccess(Array.from(selected), hasAccess);
      setSelected(new Set());
      setBulkPending(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBulkBusy(false);
    }
  }

  function exportCsv() {
    const rows = users.filter((u) => selected.has(u.id));
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [
      "name,email,role,complimentary_access",
      ...rows.map((u) => [esc(u.name ?? ""), esc(u.email), u.role, u.hasCurriculumAccess ? "yes" : "no"].join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "students.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

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
        className="w-full max-w-sm glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
      />

      {users.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-small text-slate-300">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(users.map((u) => u.id)))}
              className="h-4 w-4 cursor-pointer accent-[rgb(var(--c-s-50))]"
            />
            Select all
          </label>
          {selected.size > 0 && bulkPending === null && (
            <>
              <span className="text-small text-slate-400">{selected.size} selected</span>
              <button type="button" onClick={() => setBulkPending(true)} className="tap cta-fill rounded-control px-3 py-1.5 text-small font-semibold">
                Grant access
              </button>
              <button type="button" onClick={() => setBulkPending(false)} className="tap rounded-control bg-neu-base px-3 py-1.5 text-small font-medium text-slate-200 shadow-raised-low active:shadow-pressed-low">
                Revoke access
              </button>
              <button type="button" onClick={exportCsv} className="tap rounded-control bg-neu-base px-3 py-1.5 text-small font-medium text-slate-200 shadow-raised-low active:shadow-pressed-low">
                Export CSV
              </button>
            </>
          )}
          {bulkPending !== null && (
            <div className="flex flex-wrap items-center gap-3 rounded-control bg-neu-base px-3 py-2 shadow-pressed-low" role="alertdialog" aria-label="Confirm bulk change">
              <p className="text-small text-slate-200">
                {bulkPending ? "Grant" : "Revoke"} complimentary curriculum access for {selected.size} {selected.size === 1 ? "person" : "people"}?
                {!bulkPending && " They lose access to paid lessons immediately unless they have an active plan."}
              </p>
              <button type="button" disabled={bulkBusy} onClick={() => setBulkPending(null)} className="tap rounded-control bg-neu-base px-3 py-1.5 text-small font-medium text-slate-300 shadow-raised-low disabled:opacity-50">
                Cancel
              </button>
              <button type="button" disabled={bulkBusy} onClick={() => applyBulk(bulkPending)} className="tap cta-fill rounded-control px-3 py-1.5 text-small font-semibold disabled:opacity-50">
                {bulkBusy ? "Applying…" : `Confirm (${selected.size})`}
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-small text-red-400">{error}</p>}

      <div className="mt-5 rounded-card bg-neu-base p-2 shadow-pressed-mid">
        {users.length === 0 && (
          <div className="p-8 text-center text-small text-slate-500">
            No users found.
          </div>
        )}

        {users.map((user) => {
          const busy = busyId === user.id;
          return (
            <div key={user.id} className="border-b border-ink/10 p-5 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <input
                  type="checkbox"
                  aria-label={`Select ${user.name ?? user.email}`}
                  checked={selected.has(user.id)}
                  onChange={() => toggleSelected(user.id)}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[rgb(var(--c-s-50))]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-slate-100">{user.name ?? "—"}</p>
                  <p className="text-small text-slate-500">{user.email}</p>
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="mt-1 inline-block text-small font-medium text-[rgb(var(--c-s-50))] transition hover:opacity-70"
                  >
                    View full profile →
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-small font-medium uppercase tracking-wide ${
                      user.role === "ADMIN" ? "bg-[rgb(var(--c-s-50)/0.15)] text-[rgb(var(--c-s-50))]" : "bg-neu-base shadow-pressed-low text-slate-400"
                    }`}
                  >
                    {user.role}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-small font-medium uppercase tracking-wide ${
                      user.hasCurriculumAccess ? "bg-slate-50/15 text-slate-100" : "bg-neu-base shadow-pressed-low text-slate-400"
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
                      className={`tap h-8 min-w-[2.25rem] rounded-lg border px-2 text-small font-medium transition disabled:opacity-40 ${
                        su.completed
                          ? "border-slate-50/30 bg-slate-50/10 text-slate-100 hover:bg-slate-50/20"
                          : su.unlocked
                            ? "border-[rgb(var(--c-s-50)/0.3)] bg-[rgb(var(--c-s-50)/0.1)] text-[rgb(var(--c-s-50))] hover:bg-[rgb(var(--c-s-50)/0.2)]"
                            : "border-transparent text-slate-500 bg-neu-base shadow-raised-low"
                      }`}
                    >
                      S{scaleGroup.order}
                    </button>
                  );
                })}
              </div>

              {pendingAction?.userId === user.id ? (
                <div className="mt-4 space-y-2 rounded-lg border border-[rgb(var(--c-s-50)/0.3)] bg-[rgb(var(--c-s-50)/0.05)] p-3">
                  <p className="text-small text-slate-300">
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
                      className="tap flex-1 rounded-lg py-1.5 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
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
                      className={`tap flex flex-1 items-center justify-center rounded-lg py-1.5 text-small font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
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
                    className="tap rounded-lg px-3 py-1.5 text-small font-medium text-slate-300 transition disabled:opacity-40 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                  >
                    {user.role === "ADMIN" ? "Remove admin" : "Make admin"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPendingAction({ userId: user.id, kind: "curriculum" })}
                    className="tap rounded-lg px-3 py-1.5 text-small font-medium text-slate-300 transition disabled:opacity-40 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                  >
                    {user.hasCurriculumAccess ? "Revoke curriculum" : "Grant curriculum"}
                  </button>
                  {user.assistantMessageCount > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPendingAction({ userId: user.id, kind: "history" })}
                      className="tap rounded-lg border border-red-400/20 px-3 py-1.5 text-small font-medium text-red-400/80 transition hover:bg-red-400/10 disabled:opacity-40"
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
