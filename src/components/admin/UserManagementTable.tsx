"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import type { AdminUserRow } from "@/lib/admin";
import { SCALE_GROUPS } from "@/lib/curriculum";

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

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    withBusy(user.id, () => onSetRole(user.id, user.role === "ADMIN" ? "STUDENT" : "ADMIN"))
                  }
                  className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
                >
                  {user.role === "ADMIN" ? "Remove admin" : "Make admin"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => withBusy(user.id, () => onSetCurriculumAccess(user.id, !user.hasCurriculumAccess))}
                  className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
                >
                  {user.hasCurriculumAccess ? "Revoke curriculum" : "Grant curriculum"}
                </button>
                {user.assistantMessageCount > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Permanently delete ${user.assistantMessageCount} stored Atom message(s) for this account? This can't be undone.`)) return;
                      withBusy(user.id, () => onClearAssistantHistory(user.id));
                    }}
                    className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs font-medium text-red-400/80 transition hover:bg-red-400/10 disabled:opacity-40"
                  >
                    Clear Atom history ({user.assistantMessageCount})
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
