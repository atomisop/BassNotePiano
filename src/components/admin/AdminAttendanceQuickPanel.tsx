"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, ChevronDown, ClipboardCheck, X as XIcon } from "lucide-react";
import { adminCancelBookingAction, getBookingFeedAction, markAttendanceAction } from "@/app/(dashboard)/admin/schedule/actions";
import { MorphingSquare } from "@/components/ui/morphing-square";

const POLL_INTERVAL_MS = 30_000;
// Present and Absent stay greyed out until this long before the class starts.
const ATTENDANCE_OPENS_MIN_BEFORE = 10;

interface FeedRow {
  bookingId: string;
  studentName: string | null;
  studentEmail: string;
  scheduleLabel: string | null;
  scheduledAt: string;
}

interface DayGroup {
  key: string;
  label: string;
  isToday: boolean;
  rows: FeedRow[];
}

function dayKeyOf(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA"); // YYYY-MM-DD in the viewer's own time zone
}

function dayLabelOf(iso: string): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(d) - startOf(new Date())) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * TopBar-level class bookings panel, admin-only. It reads the same active
 * ClassBooking rows as Schedule's bookings tab (see getBookingFeed in
 * classSchedule.ts) and groups them by day, each day a drop-down. Per booking:
 * the student and time on the left; Present and Absent on the right, greyed
 * out until 10 minutes before the class starts (that is when attendance gets
 * taken); and a solid cancel button that works at any time. Present/Absent use
 * the same markAttendanceAction as the full roster, which stays the place to
 * correct a mistake later.
 *
 * Portaled to document.body for the same reason NotificationBell's panel is:
 * an ancestor with a CSS transform would otherwise turn `position: fixed`
 * into "fixed to that ancestor".
 */
export function AdminAttendanceQuickPanel() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which day drop-downs the admin has toggled by hand; anything not in here
  // uses its default (open for today and anything that needs a call).
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  // Ticks so the greyed-out buttons light up on their own as a class nears.
  const [now, setNow] = useState(() => Date.now());
  const wrapperRef = useRef<HTMLDivElement>(null);
  // The panel is portaled to document.body, so it is never a DOM descendant of
  // wrapperRef; the outside-click handler has to check both.
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  async function refresh() {
    try {
      const found = await getBookingFeedAction();
      setRows(found.map((r) => ({ ...r, scheduledAt: new Date(r.scheduledAt).toISOString() })));
    } catch (err) {
      console.error("Class bookings refresh failed (non-blocking, will retry):", err);
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        refresh();
      }
    }, POLL_INTERVAL_MS);
    const clock = setInterval(() => setNow(Date.now()), 20_000);
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        refresh();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      clearInterval(clock);
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

  const isReady = (iso: string) => new Date(iso).getTime() - ATTENDANCE_OPENS_MIN_BEFORE * 60_000 <= now;
  const readyCount = rows.filter((r) => isReady(r.scheduledAt)).length;

  const groups = useMemo<DayGroup[]>(() => {
    const map = new Map<string, DayGroup>();
    for (const r of rows) {
      const key = dayKeyOf(r.scheduledAt);
      const group = map.get(key) ?? { key, label: dayLabelOf(r.scheduledAt), isToday: dayLabelOf(r.scheduledAt) === "Today", rows: [] };
      group.rows.push(r);
      map.set(key, group);
    }
    return Array.from(map.values());
  }, [rows]);

  async function handleMark(bookingId: string, attendance: "PRESENT" | "NO_SHOW") {
    setBusyId(bookingId);
    setError(null);
    try {
      await markAttendanceAction(bookingId, attendance);
      setRows((prev) => prev.filter((r) => r.bookingId !== bookingId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(bookingId: string) {
    setBusyId(bookingId);
    setError(null);
    try {
      const result = await adminCancelBookingAction(bookingId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRows((prev) => prev.filter((r) => r.bookingId !== bookingId));
      setConfirmCancelId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  const gatedClass =
    "tap flex min-h-9 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-small font-medium transition bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-pressed-low disabled:hover:shadow-pressed-low";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Class bookings and attendance"
        title="Class bookings and attendance"
        aria-expanded={open}
        className={`tap relative flex h-9 w-9 items-center justify-center rounded-lg bg-neu-base transition ${
          open
            ? "text-signal shadow-pressed-low"
            : "text-slate-400 shadow-raised-low hover:text-slate-200 hover:shadow-raised-mid active:shadow-pressed-low"
        }`}
      >
        <ClipboardCheck className="h-[18px] w-[18px]" strokeWidth={1.5} />
        {rows.length > 0 && (
          // Total active bookings, from the moment each is made until it is
          // marked present, absent or canceled. Orange while any class is ready
          // for attendance, neutral otherwise.
          <span
            className={`absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-small font-bold ${
              readyCount > 0 ? "bg-signal text-slate-950" : "bg-slate-600 text-white"
            }`}
            aria-label={`${rows.length} active booking${rows.length === 1 ? "" : "s"}${readyCount > 0 ? `, ${readyCount} ready for attendance` : ""}`}
          >
            {rows.length > 99 ? "99+" : rows.length}
          </span>
        )}
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed right-3 top-16 z-[60] max-h-[75vh] w-[min(26rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl bg-neu-base p-3 shadow-raised-high sm:right-8"
            role="dialog"
            aria-label="Class bookings"
          >
            <div className="flex items-start justify-between gap-3 px-1">
              <div>
                <p className="text-body font-semibold text-slate-100">Class bookings</p>
                <p className="text-small text-slate-500">
                  {rows.length} booking{rows.length === 1 ? "" : "s"}
                  {readyCount > 0 ? ` · ${readyCount} ready` : ""}
                </p>
              </div>
              <Link
                href="/admin/schedule?view=ATTENDANCE"
                onClick={() => setOpen(false)}
                className="tap shrink-0 text-small font-medium text-[rgb(var(--signal))] transition hover:opacity-70"
              >
                Full view
              </Link>
            </div>

            {error && <p className="mt-2 px-1 text-small text-red-400">{error}</p>}

            {loading && rows.length === 0 ? (
              <p className="mt-3 px-1 text-small text-slate-500">Loading…</p>
            ) : groups.length === 0 ? (
              <p className="mt-3 px-1 text-small text-slate-500">No bookings coming up.</p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {groups.map((group) => {
                  const readyInGroup = group.rows.filter((r) => isReady(r.scheduledAt)).length;
                  const defaultOpen = group.isToday || readyInGroup > 0;
                  const expanded = toggled[group.key] ?? defaultOpen;
                  return (
                    <section key={group.key}>
                      <button
                        type="button"
                        onClick={() => setToggled((prev) => ({ ...prev, [group.key]: !expanded }))}
                        aria-expanded={expanded}
                        className={`tap flex w-full items-center gap-2 rounded-xl bg-neu-base px-3 py-2.5 text-left transition ${
                          expanded ? "shadow-pressed-low" : "shadow-raised-low hover:shadow-raised-mid"
                        }`}
                      >
                        <span className="text-small font-semibold text-slate-100">{group.label}</span>
                        <span className="text-small text-slate-500">
                          {group.rows.length} class{group.rows.length === 1 ? "" : "es"}
                        </span>
                        {readyInGroup > 0 && (
                          <span className="rounded-full bg-signal px-1.5 py-0.5 text-small font-bold leading-none text-slate-950">
                            {readyInGroup} ready
                          </span>
                        )}
                        <ChevronDown
                          className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                          strokeWidth={2}
                          aria-hidden
                        />
                      </button>

                      {expanded && (
                        <div className="mt-1.5 space-y-1.5 rounded-xl bg-neu-base p-1.5 shadow-pressed-low">
                          {group.rows.map((r) => {
                            const ready = isReady(r.scheduledAt);
                            const busy = busyId === r.bookingId;
                            const confirming = confirmCancelId === r.bookingId;
                            return (
                              <div key={r.bookingId} className="rounded-lg bg-neu-base p-2.5 shadow-raised-low">
                                <div className="flex items-center gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-small font-medium text-slate-100">{r.studentName ?? r.studentEmail}</p>
                                    <p className="truncate text-small text-slate-500">
                                      {timeOf(r.scheduledAt)}
                                      {r.scheduleLabel ? ` · ${r.scheduleLabel}` : ""}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={!ready || busy}
                                    onClick={() => handleMark(r.bookingId, "PRESENT")}
                                    title={ready ? "Mark present" : `Opens ${ATTENDANCE_OPENS_MIN_BEFORE} minutes before class`}
                                    className={`${gatedClass} text-slate-100`}
                                  >
                                    {busy ? <MorphingSquare size={11} /> : <Check className="h-3.5 w-3.5" strokeWidth={2} />}
                                    Present
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!ready || busy}
                                    onClick={() => handleMark(r.bookingId, "NO_SHOW")}
                                    title={ready ? "Mark absent" : `Opens ${ATTENDANCE_OPENS_MIN_BEFORE} minutes before class`}
                                    className={`${gatedClass} text-red-400`}
                                  >
                                    {busy ? <MorphingSquare size={11} /> : <XIcon className="h-3.5 w-3.5" strokeWidth={2} />}
                                    Absent
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setConfirmCancelId(confirming ? null : r.bookingId)}
                                    aria-label={`Cancel booking for ${r.studentName ?? r.studentEmail}`}
                                    title="Cancel this booking"
                                    className="tap flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white shadow-raised-low transition hover:bg-red-400 active:shadow-pressed-low disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <XIcon className="h-4 w-4" strokeWidth={2.5} />
                                  </button>
                                </div>
                                {confirming && (
                                  <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-neu-base px-2.5 py-2 shadow-pressed-low">
                                    <p className="text-small text-slate-300">Cancel this booking? The student is told and not charged.</p>
                                    <div className="flex shrink-0 gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setConfirmCancelId(null)}
                                        disabled={busy}
                                        className="tap rounded-lg px-2.5 py-1.5 text-small font-medium text-slate-300 bg-neu-base shadow-raised-low active:shadow-pressed-low disabled:opacity-50"
                                      >
                                        Keep
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleCancel(r.bookingId)}
                                        disabled={busy}
                                        className="tap flex items-center gap-1 rounded-lg bg-red-500 px-2.5 py-1.5 text-small font-semibold text-white shadow-raised-low hover:bg-red-400 disabled:opacity-50"
                                      >
                                        {busy && <MorphingSquare size={11} />}
                                        Cancel booking
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
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
