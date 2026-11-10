"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "@/components/ui/appIcons";
import { AdminListSearch } from "@/components/admin/AdminListSearch";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { BulkBar, RowCheck } from "@/components/admin/BulkBar";
import { ViewMore } from "@/components/ui/ViewMore";
import { EmptyState } from "@/components/ui/EmptyState";
import { Search } from "@/components/ui/appIcons";
import { toast } from "@/components/ui/Toaster";
import { PersonPeekPanel } from "@/components/admin/PersonPeekPanel";
import { MessageSquare } from "@/components/ui/appIcons";
import { MAX_MESSAGE_RECIPIENTS, messageComposeHref } from "@/lib/commandRecents";
import { Meta } from "@/components/ui/CardKit";

export interface UserListRow {
  id: string;
  name: string | null;
  email: string;
  /** Shown only for people who are not students. */
  roleLabel: string | null;
  /** The owner gave this account curriculum access by hand (no plan needed). */
  complimentary?: boolean;
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
  onApproveNext: (userId: string, force: boolean, notify?: boolean) => Promise<void>;
}) {
  const [notify, setNotify] = useNotifyStudent("scales");
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // On a computer a tap on a row opens a summary beside the list; on a phone (or with a modifier key) it opens the full page as before.
  const [peekId, setPeekId] = useState<string | null>(null);
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
      const hold = await toast.held("Releasing the next scale", () => onApproveNext(userId, false, notify), { mail: notify });
      if (hold.undone) return;
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
      <NotifyToggle on={notify} onChange={setNotify} label="Notify students" className="mt-3" />

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
            ? [{ label: "Approve next scale", question: `Release the next scale for ${pickedList.length} student${pickedList.length === 1 ? "" : "s"}? ${notify ? "Each one is told right away." : "Nobody is told (Notify is off)."}`, confirmLabel: "Yes, approve", run: (id: string) => onApproveNext(id, false, notify) }]
            : []),
        ]}
        extra={
          <>
            {/* Write to everyone picked without retyping their names: Inbox > Messages opens with them filled in. */}
            <Link
              href={messageComposeHref(pickedList)}
              onClick={() => {
                if (pickedList.length > MAX_MESSAGE_RECIPIENTS) toast.warning(`Messages go to ${MAX_MESSAGE_RECIPIENTS} people at a time. The first ${MAX_MESSAGE_RECIPIENTS} are filled in.`);
              }}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <MessageSquare aria-hidden className="h-4 w-4" />
              Message
            </Link>
            <button
              type="button"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
              onClick={() => void navigator.clipboard?.writeText(pickedList.map((id) => rows.find((r) => r.id === id)?.email).filter(Boolean).join(", "))}
            >
              Copy emails
            </button>
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={<Search />} title="No one found" description="Try another name or email, or another tab." />
      ) : (
        <ul data-stagger="" className="glass-surface divide-y divide-slate-50/10 px-4">
          <ViewMore items={rows} initial={15} step={20}>
          {(row) => (
            <li key={row.id} className="flex items-center gap-2">
              <RowCheck checked={picked.has(row.id)} onChange={(on) => toggle(row.id, on)} label={`Select ${row.name ?? row.email}`} />
              <Link
                href={`/admin/users/${row.id}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  if (!window.matchMedia("(min-width: 1024px)").matches) return;
                  e.preventDefault();
                  setPeekId(row.id);
                }}
                aria-current={peekId === row.id ? "true" : undefined}
                className={`tap flex min-w-0 flex-1 items-center gap-3 py-3 ${peekId === row.id ? "text-signal-fg" : ""}`}
              >
                {/* Name first and bright, every other fact in one quiet line under it (a role is a word there, not a badge). The one
                    figure that matters, this week's practice, sits on the right, amber when it is a problem. */}
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-body font-semibold ${peekId === row.id ? "text-signal-fg" : "text-slate-50"}`}>{row.name ?? row.email}</p>
                  <Meta
                    className="truncate"
                    items={[
                      row.roleLabel ? <span className={row.roleLabel === "Banned" ? "text-red-300" : undefined}>{row.roleLabel}</span> : null,
                      row.complimentary ? "Complimentary" : null,
                      row.progress ? <span className="tabular-nums">{row.progress} scales</span> : null,
                      // On a row with the Approve button the button takes the right side, so practice joins the quiet line.
                      row.readyScale && row.practiceDays !== null ? (
                        <span className={`tabular-nums ${row.practiceDays === 0 ? "text-amber-300" : ""}`}>{row.practiceDays}/7 practice</span>
                      ) : null,
                      // Last, so a long address is what gets cut short on a phone, never the facts before it.
                      row.name ? row.email : null,
                    ]}
                  />
                </div>
                {!row.readyScale && row.practiceDays !== null && (
                  <span className="shrink-0 text-right" title="Days this week with the full 10 minutes of practice">
                    <span className={`block text-body font-semibold tabular-nums ${row.practiceDays === 0 ? "text-amber-300" : "text-slate-50"}`}>{row.practiceDays}/7</span>
                    <span className="block text-caption text-slate-500">practice</span>
                  </span>
                )}
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
          )}
          </ViewMore>
        </ul>
      )}
      {peekId && <PersonPeekPanel userId={peekId} onClose={() => setPeekId(null)} />}
    </div>
  );
}
