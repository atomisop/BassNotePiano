"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardCheck, Check, X as XIcon } from "lucide-react";
import { getPendingAttendanceBookingsAction, markAttendanceAction } from "@/app/(dashboard)/admin/schedule/actions";
import { MorphingSquare } from "@/components/ui/morphing-square";

const POLL_INTERVAL_MS = 30_000;

interface PendingRow {
  bookingId: string;
  studentName: string | null;
  studentEmail: string;
  scheduleLabel: string | null;
  scheduledAt: string;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * TopBar-level shortcut, admin-only, next to the Shield icon — by direct
 * instruction: marking Present/No-show used to require navigating all the
 * way into Schedule → Attendance first, for something an admin
 * wants to do "from anywhere" right after a class wraps up. This is a
 * lighter, purpose-built duplicate of that same action (see
 * markAttendanceAction in admin/schedule/actions.ts, the same function both
 * call), not a replacement for the full roster there — no cancel action,
 * no 60-day history, just the short list of classes that already happened
 * and still need a call.
 *
 * Portaled to document.body, same reasoning NotificationBell's own panel
 * already documents: an ancestor with a CSS transform (this app's
 * page-enter animation) turns a plain `position: fixed` panel into "fixed
 * to that ancestor" instead of the true viewport.
 */
export function AdminAttendanceQuickPanel() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // The panel itself is portaled to document.body (see the render below),
  // so it's never a DOM descendant of wrapperRef — checking only that ref
  // in the outside-click handler treated every click inside the panel,
  // including Present/No-show, as "outside" and closed it on mousedown
  // before the button's own click ever fired. This second ref is what
  // outside-click checks against too.
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  async function refresh() {
    try {
      const found = await getPendingAttendanceBookingsAction();
      setRows(found.map((r) => ({ ...r, scheduledAt: new Date(r.scheduledAt).toISOString() })));
    } catch (err) {
      console.error("Pending attendance refresh failed (non-blocking, will retry):", err);
    }
  }

  // Polls for the badge count regardless of open/closed, same visibility-
  // aware cadence as NotificationBell's own poll — no point spending a
  // request on a hidden tab.
  useEffect(() => {
    refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_INTERVAL_MS);
    function handleVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    refresh().finally(() => setLoading(false));
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClickOutside);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleMark(bookingId: string, attendance: "PRESENT" | "NO_SHOW") {
    setMarkingId(bookingId);
    setError(null);
    try {
      await markAttendanceAction(bookingId, attendance);
      setRows((prev) => prev.filter((r) => r.bookingId !== bookingId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Quick attendance"
        title="Quick attendance"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-ink/10 bg-surface text-slate-400 transition hover:border-ink/15 hover:bg-ink/5 hover:text-slate-200"
      >
        <ClipboardCheck className="h-[18px] w-[18px]" strokeWidth={1.5} />
        {rows.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[rgb(var(--c-s-50))] px-1 text-small font-bold text-slate-950">
            {rows.length > 9 ? "9+" : rows.length}
          </span>
        )}
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={panelRef}
            className="glass-surface-elevated fixed right-4 top-16 z-[60] max-h-[70vh] w-[22rem] overflow-y-auto rounded-2xl p-3 shadow-raised-high sm:right-8"
            role="dialog"
            aria-label="Quick attendance"
          >
            <p className="px-1 text-small font-medium uppercase tracking-wide text-slate-500">Needs attendance</p>

            {error && <p className="mt-2 px-1 text-small text-red-400">{error}</p>}

            {loading && rows.length === 0 ? (
              <p className="mt-3 px-1 text-small text-slate-500">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="mt-3 px-1 text-small text-slate-500">Nothing waiting — every past class is marked.</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {rows.map((r) => {
                  const marking = markingId === r.bookingId;
                  return (
                    <div key={r.bookingId} className="rounded-xl border border-ink/10 p-2.5">
                      <p className="truncate text-small text-slate-100">{r.studentName ?? r.studentEmail}</p>
                      <p className="truncate text-small text-slate-500">
                        {r.scheduleLabel ?? "Class"} · {formatWhen(r.scheduledAt)}
                      </p>
                      <div className="mt-2 flex gap-1.5">
                        <button
                          type="button"
                          disabled={marking}
                          onClick={() => handleMark(r.bookingId, "PRESENT")}
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-50/30 py-1.5 text-small font-medium text-slate-100 transition hover:bg-slate-50/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {marking ? <MorphingSquare size={11} /> : <Check className="h-3.5 w-3.5" strokeWidth={2} />}
                          Present
                        </button>
                        <button
                          type="button"
                          disabled={marking}
                          onClick={() => handleMark(r.bookingId, "NO_SHOW")}
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-400/30 py-1.5 text-small font-medium text-red-400 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {marking ? <MorphingSquare size={11} /> : <XIcon className="h-3.5 w-3.5" strokeWidth={2} />}
                          No-show
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
