"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AdminListSearch } from "@/components/admin/AdminListSearch";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { BulkBar, RowCheck } from "@/components/admin/BulkBar";

export interface UserListRow {
  id: string;
  name: string | null;
  email: string;
  /** Shown only for people who are not students. */
  roleLabel: string | null;
  /** "3/15", only for students. */
  progress: string | null;
  /** Code of the scale the teacher can release right now, e.g. "S4". */
  readyScale: string | null;
  /** Days of the last 7 with the full 10 minutes of finger practice; null when practice is not expected of them. */
  practiceDays: number | null;
}

/**
 * One quiet row per person. Everything else (role, access, per-scale locks,
 * Atom history) lives on the person's own profile, one tap away.
 */
export function UserList({
  rows,
  initialQuery,
  onApproveNext,
}: {
  rows: UserListRow[];
  initialQuery: string;
  onApproveNext: (userId: string, force: boolean) => Promise<void>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pickedList = [...picked].filter((id) => rows.some((r) => r.id === id));
  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  function handleSearchChange(value: string) {
    setQuery(value);
    const params = new URLSearchParams(window.location.search);
    if (value.trim()) params.set("q", value.trim());
    else params.delete("q");
    router.replace(`/admin/users${params.toString() ? `?${params}` : ""}`);
  }

  async function approve(userId: string) {
    setBusyId(userId);
    setError(null);
    try {
      await onApproveNext(userId, false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <AdminListSearch value={query} onChange={handleSearchChange} placeholder="Search a name or email" shown={rows.length} total={rows.length} />

      {error && <p className="mb-3 text-small text-red-400">{error}</p>}

      <BulkBar
        ids={pickedList}
        onClear={() => setPicked(new Set())}
        onDone={(ok) => {
          setPicked((prev) => new Set([...prev].filter((id) => !ok.includes(id))));
          router.refresh();
        }}
        actions={[
          ...(pickedList.length > 0 && pickedList.every((id) => rows.find((r) => r.id === id)?.readyScale)
            ? [{ label: "Approve next scale", question: `Release the next scale for ${pickedList.length} student${pickedList.length === 1 ? "" : "s"}? Each one is told right away.`, confirmLabel: "Yes, approve", run: (id: string) => onApproveNext(id, false) }]
            : []),
        ]}
        extra={
          <button
            type="button"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
            onClick={() => void navigator.clipboard?.writeText(pickedList.map((id) => rows.find((r) => r.id === id)?.email).filter(Boolean).join(", "))}
          >
            Copy emails
          </button>
        }
      />

      {rows.length === 0 ? (
        <p className="glass-surface p-8 text-center text-small text-slate-500">No one found.</p>
      ) : (
        <ul className="glass-surface divide-y divide-slate-50/10 px-4">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-2">
              <RowCheck checked={picked.has(row.id)} onChange={(on) => toggle(row.id, on)} label={`Select ${row.name ?? row.email}`} />
              <Link href={`/admin/users/${row.id}`} className="tap flex min-w-0 flex-1 items-center gap-3 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body text-slate-50">{row.name ?? row.email}</p>
                  {row.name && <p className="truncate text-small text-slate-500">{row.email}</p>}
                </div>
                {row.roleLabel && <span className="shrink-0 text-small text-slate-400">{row.roleLabel}</span>}
                {row.practiceDays !== null && (
                  <span
                    title="Days this week with the full 10 minutes of practice"
                    className={`shrink-0 text-small tabular-nums ${row.practiceDays === 0 ? "text-amber-400" : "text-slate-400"}`}
                  >
                    {row.practiceDays}/7 practice
                  </span>
                )}
                {row.progress && <span className="shrink-0 text-small tabular-nums text-slate-400">{row.progress}</span>}
                {!row.readyScale && <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />}
              </Link>
              {row.readyScale && (
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void approve(row.id)}
                  className={buttonVariants({ variant: "primary", size: "sm", className: "shrink-0" })}
                >
                  {busyId === row.id && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                  {busyId === row.id ? "Releasing…" : `Approve ${row.readyScale}`}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
