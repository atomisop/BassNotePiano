"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AdminProgressRow, AdminProgressScaleCell } from "@/lib/admin";

export interface ProgressMatrixProps {
  rows: AdminProgressRow[];
  initialQuery: string;
  onToggleScale: (userId: string, scaleSlug: string, unlock: boolean) => Promise<void>;
  /** Releases the student's next scale. `force` goes past the checklist and weekly-pace rules. */
  onApproveNext: (userId: string, force: boolean) => Promise<void>;
}

const ACCESS_BADGE: Record<AdminProgressRow["accessKind"], { label: string; className: string }> = {
  ADMIN: { label: "Admin", className: "bg-slate-800 text-slate-400" },
  PAID: { label: "Live student", className: "bg-emerald-400/15 text-emerald-300" },
  COMPED: { label: "Comped", className: "bg-emerald-400/15 text-emerald-300" },
  TRIAL: { label: "Free trial", className: "bg-[rgb(var(--c-a-400)/0.15)] text-[rgb(var(--c-a-400))]" },
  NONE: { label: "No plan", className: "bg-slate-800 text-slate-400" },
};

function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function cellClasses(cell: AdminProgressScaleCell): string {
  if (cell.status === "COMPLETED") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20";
  if (cell.status === "IN_PROGRESS") return "border-[rgb(var(--c-a-400)/0.4)] bg-[rgb(var(--c-a-400)/0.12)] text-[rgb(var(--c-a-400))] hover:bg-[rgb(var(--c-a-400)/0.2)]";
  if (cell.unlocked) return "border-[rgb(var(--c-s-50)/0.3)] bg-[rgb(var(--c-s-50)/0.08)] text-[rgb(var(--c-s-50))] hover:bg-[rgb(var(--c-s-50)/0.15)]";
  return "border-ink/10 text-slate-600 hover:border-ink/20";
}

function cellTooltip(cell: AdminProgressScaleCell): string {
  const parts = [
    `${cell.code} — ${cell.title}`,
    cell.moduleRead ? "Module read" : "Module unread",
    cell.practiceCompleted ? "Practice logged" : "Practice pending",
    cell.quizPassed ? `Quiz passed${cell.quizScore !== null ? ` (${cell.quizScore})` : ""}` : "Quiz pending",
    `Click to ${cell.unlocked ? "lock" : "unlock"}.`,
  ];
  return parts.join(" · ");
}

// Same relative-time formatting the old /admin/roster page's table used —
// carried over rather than dropped now that its "last active" figure lives
// in this sticky column instead of its own table.
function relativeDays(ms: number | null): string {
  if (ms === null) return "Never";
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function ProgressMatrix({ rows, initialQuery, onToggleScale, onApproveNext }: ProgressMatrixProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSearchChange(value: string) {
    setQuery(value);
    const params = new URLSearchParams();
    if (value.trim()) params.set("q", value.trim());
    router.replace(`/admin/progress${params.toString() ? `?${params}` : ""}`);
  }

  async function handleToggle(userId: string, cell: AdminProgressScaleCell) {
    const key = `${userId}:${cell.slug}`;
    setBusyCell(key);
    setError(null);
    try {
      await onToggleScale(userId, cell.slug, !cell.unlocked);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyCell(null);
    }
  }

  async function handleApprove(userId: string, force: boolean) {
    setBusyCell(`${userId}:approve`);
    setError(null);
    try {
      await onApproveNext(userId, force);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyCell(null);
    }
  }

  const scaleColumns = rows[0]?.scales ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <input
          type="search"
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full max-w-sm glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
        />
        <div className="flex flex-wrap items-center gap-3 text-small text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-ink/10" /> Locked
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-[rgb(var(--c-s-50)/0.3)] bg-[rgb(var(--c-s-50)/0.08)]" /> Unlocked
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-[rgb(var(--c-a-400)/0.4)] bg-[rgb(var(--c-a-400)/0.12)]" /> In progress
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-emerald-400/30 bg-emerald-400/10" /> Completed
          </span>
        </div>
      </div>

      {error && <p className="mt-3 text-small text-red-400">{error}</p>}

      {rows.length === 0 ? (
        <div className="glass-surface mt-5 p-8 text-center text-small text-slate-500">No students found.</div>
      ) : (
        <div className="glass-surface mt-5 overflow-x-auto p-0">
          <table className="w-full border-separate border-spacing-0 text-small">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-[var(--c-bg,theme(colors.slate.950))] p-3 text-left text-small font-medium uppercase tracking-wide text-slate-500">
                  Student
                </th>
                {scaleColumns.map((sg) => (
                  <th key={sg.slug} title={`${sg.code} — ${sg.title}`} className="p-2 text-center text-small font-medium text-slate-500">
                    S{sg.order + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-ink/10">
                  <td className="sticky left-0 z-10 bg-[var(--c-bg,theme(colors.slate.950))] p-3">
                    <p className="text-small text-slate-100">{row.name ?? "—"}</p>
                    <p className="text-small text-slate-500">{row.email}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        title={row.accessUntil ? `Access runs until ${formatShortDate(row.accessUntil)}` : undefined}
                        className={`rounded-full px-2 py-0.5 text-small font-medium uppercase tracking-wide ${ACCESS_BADGE[row.accessKind].className}`}
                      >
                        {ACCESS_BADGE[row.accessKind].label}
                        {row.accessUntil && row.accessKind !== "PAID" ? ` · ends ${formatShortDate(row.accessUntil)}` : ""}
                      </span>
                      <Link href={`/admin/users/${row.id}`} className="text-small font-medium text-[rgb(var(--c-s-50))] transition hover:opacity-70">
                        Full profile →
                      </Link>
                    </div>
                    {/* Folded in from the old, now-removed /admin/roster
                        table — same four figures a teacher used to check on
                        a separate page, now sitting right next to the
                        per-scale detail they summarize. */}
                    {row.hasCurriculumAccess && row.accessKind !== "ADMIN" && (
                      <NextScaleControl
                        row={row}
                        busy={busyCell === `${row.id}:approve`}
                        onApprove={(force) => handleApprove(row.id, force)}
                      />
                    )}
                    <p className="mt-1.5 whitespace-nowrap text-small tabular-nums text-slate-500">
                      {row.scalesCompleted}/{row.scales.length} scales · {row.currentStreak}-day streak ·{" "}
                      {row.classCredits} credit{row.classCredits === 1 ? "" : "s"} · {relativeDays(row.lastActivityAt)}
                    </p>
                  </td>
                  {row.scales.map((cell) => {
                    const key = `${row.id}:${cell.slug}`;
                    const busy = busyCell === key;
                    return (
                      <td key={cell.slug} className="p-1.5 text-center">
                        <button
                          type="button"
                          title={cellTooltip(cell)}
                          disabled={busy}
                          onClick={() => handleToggle(row.id, cell)}
                          className={`h-8 w-9 rounded-lg border text-small font-medium transition disabled:opacity-40 ${cellClasses(cell)}`}
                        >
                          {busy ? "…" : cell.status === "COMPLETED" ? "✓" : cell.unlocked ? "•" : "×"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NextScaleControl({ row, busy, onApprove }: { row: AdminProgressRow; busy: boolean; onApprove: (force: boolean) => void }) {
  const next = row.nextApproval;
  if (next.state === "ALL_UNLOCKED") return <p className="mt-1.5 text-small text-slate-500">Every scale released.</p>;

  const nextCode = row.scales.find((s) => s.slug === next.nextSlug)?.code ?? "next scale";
  const forceButton = (label: string) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => onApprove(true)}
      className="text-small font-medium text-slate-400 underline transition hover:text-slate-200 disabled:opacity-40"
    >
      {label}
    </button>
  );

  if (next.state === "READY") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onApprove(false)}
        className="cta-sheen cta-fill mt-1.5 rounded-lg px-3 py-1 text-small font-semibold disabled:opacity-40"
      >
        {busy ? "Releasing…" : `Approve ${nextCode}`}
      </button>
    );
  }
  if (next.state === "WAITING_PACE") {
    return (
      <p className="mt-1.5 text-small text-slate-500">
        {nextCode} ready {formatShortDate(next.availableAt)} (one per week). {forceButton("Release now")}
      </p>
    );
  }
  return (
    <p className="mt-1.5 text-small text-slate-500">
      Still finishing the last scale. {forceButton(`Release ${nextCode} anyway`)}
    </p>
  );
}
