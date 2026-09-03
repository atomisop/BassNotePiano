"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime, formatEndTime } from "@/lib/classScheduleLabels";

interface RosterFocus {
  scaleOrder: number | null;
  scaleLabel: string;
  action: string;
}

interface RosterEntry {
  bookingId: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  studentImage: string | null;
  status: "SCHEDULED" | "CANCELED" | "COMPLETED";
  attendance: "PRESENT" | "NO_SHOW" | null;
  /** Credits this booking costs once attendance is taken. */
  creditsSpent: number;
  /** Shared across every row from the same family booking — null for a solo booking. */
  familyBookingGroupId: string | null;
  focus: RosterFocus;
}

/** Clusters one occurrence's roster by where each student actually is in
    the curriculum, ascending — a flipped-classroom-style live session
    means circulating by level instead of teaching one lockstep lesson, so
    "who's here today, grouped by level" is the thing worth seeing at a
    glance. No-curriculum-access sorts last: a real, distinct bucket, not
    "behind Scale 0". */
function groupByFocus(roster: RosterEntry[]) {
  const groups = new Map<string, { scaleOrder: number | null; scaleLabel: string; entries: RosterEntry[] }>();
  for (const entry of roster) {
    const key = entry.focus.scaleOrder === null ? "none" : String(entry.focus.scaleOrder);
    let group = groups.get(key);
    if (!group) {
      group = { scaleOrder: entry.focus.scaleOrder, scaleLabel: entry.focus.scaleLabel, entries: [] };
      groups.set(key, group);
    }
    group.entries.push(entry);
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (a.scaleOrder === null) return 1;
    if (b.scaleOrder === null) return -1;
    return a.scaleOrder - b.scaleOrder;
  });
}

interface OccurrenceGroup {
  scheduleId: string;
  label: string | null;
  dayOfWeek: number;
  occurrenceDateMs: number;
  scheduledAt: string;
  roster: RosterEntry[];
}

export interface AdminAttendanceRosterProps {
  occurrences: OccurrenceGroup[];
  onMarkAttendance: (bookingId: string, attendance: "PRESENT" | "NO_SHOW") => Promise<void>;
  onCancelBooking: (bookingId: string, reason?: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

function Avatar({ image, name }: { image: string | null; name: string }) {
  return (
    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-ink/10 bg-slate-800">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-serif text-sm text-[rgb(var(--c-a-300))]">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

export function AdminAttendanceRoster({ occurrences, onMarkAttendance, onCancelBooking }: AdminAttendanceRosterProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleMark(bookingId: string, attendance: "PRESENT" | "NO_SHOW") {
    setError(null);
    setBusyId(bookingId);
    try {
      await onMarkAttendance(bookingId, attendance);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(bookingId: string) {
    setError(null);
    setBusyId(bookingId);
    try {
      const result = await onCancelBooking(bookingId, reason.trim() || undefined);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCancelingId(null);
      setReason("");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (occurrences.length === 0) {
    return <div className="glass-surface p-8 text-center text-sm text-slate-500">No bookings in the last 60 days.</div>;
  }

  return (
    <div className="space-y-4">
      {occurrences.map((occ) => {
        const key = `${occ.scheduleId}:${occ.occurrenceDateMs}`;
        const hasHappened = new Date(occ.scheduledAt).getTime() <= Date.now();
        const activeRoster = occ.roster.filter((r) => r.status !== "CANCELED");
        // One booking party per occurrence now (see getUpcomingOccurrences):
        // a family booking is every row sharing the same familyBookingGroupId,
        // a solo booking is the one row with none.
        const isFamily = activeRoster.length > 0 && activeRoster[0]!.familyBookingGroupId !== null;
        return (
          <div key={key} className="glass-surface p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-serif text-lg text-slate-50">{occ.label ?? "Class"}</h3>
                <p className="mt-0.5 text-sm text-slate-500">{formatDateTime(occ.scheduledAt)}</p>
              </div>
              {activeRoster.length > 0 && (
                <span className="rounded-full border border-ink/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {isFamily ? `Family · ${activeRoster.length} students` : "One-on-one"}
                </span>
              )}
            </div>

            <div className="mt-4 space-y-5">
              {groupByFocus(activeRoster).map((group) => (
                <div key={group.scaleLabel}>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[rgb(var(--c-a-400)/0.8)]">
                    {group.scaleLabel} · {group.entries.length} student{group.entries.length === 1 ? "" : "s"}
                  </p>
                  <div className="space-y-2">
                    {group.entries.map((entry) => {
                      const isCanceling = cancelingId === entry.bookingId;
                      const canCancel = entry.status === "SCHEDULED";
                      const canMarkAttendance = entry.status === "SCHEDULED" && hasHappened;
                      return (
                        <div key={entry.bookingId} className="rounded-xl border border-ink/10 p-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                              <Avatar image={entry.studentImage} name={entry.studentName ?? entry.studentEmail} />
                              <div>
                                <p className="text-sm text-slate-100">{entry.studentName ?? "Student"}</p>
                                <p className="text-xs text-slate-600">
                                  {entry.studentEmail} · until {formatEndTime(occ.scheduledAt, entry.creditsSpent)} (
                                  {entry.creditsSpent} credit{entry.creditsSpent === 1 ? "" : "s"})
                                </p>
                                <p className="mt-0.5 text-xs text-[rgb(var(--c-a-300))]">{entry.focus.action}</p>
                              </div>
                            </div>

                            {entry.attendance ? (
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
                                  entry.attendance === "PRESENT" ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-400"
                                }`}
                              >
                                {entry.attendance === "PRESENT" ? "Present" : "No-show"}
                              </span>
                            ) : isCanceling ? null : (
                              <div className="flex flex-wrap gap-2">
                                {canMarkAttendance && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleMark(entry.bookingId, "PRESENT")}
                                      disabled={busyId === entry.bookingId}
                                      className="rounded-lg border border-emerald-400/30 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Present
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMark(entry.bookingId, "NO_SHOW")}
                                      disabled={busyId === entry.bookingId}
                                      className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      No-show
                                    </button>
                                  </>
                                )}
                                {!canMarkAttendance && !hasHappened && (
                                  <span className="rounded-full border border-ink/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    Upcoming
                                  </span>
                                )}
                                {canCancel && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setError(null);
                                      setReason("");
                                      setCancelingId(entry.bookingId);
                                    }}
                                    disabled={busyId === entry.bookingId}
                                    className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-red-400/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Cancel booking
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {isCanceling && (
                            <div className="mt-3 space-y-2 border-t border-ink/10 pt-3">
                              <p className="text-xs text-slate-500">
                                This refunds {entry.studentName ?? "the student"}&apos;s credit and notifies them — no
                                24-hour cutoff applies to a cancellation you make.
                              </p>
                              <input
                                type="text"
                                autoFocus
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Reason (optional, shown to the student)"
                                className="w-full glass-surface-subtle px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-red-400/60"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCancelingId(null);
                                    setReason("");
                                  }}
                                  disabled={busyId === entry.bookingId}
                                  className="flex-1 rounded-lg border border-ink/10 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                                >
                                  Never mind
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancel(entry.bookingId)}
                                  disabled={busyId === entry.bookingId}
                                  className="flex-1 rounded-lg bg-red-500/95 py-2 text-xs font-semibold text-slate-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {busyId === entry.bookingId ? "Canceling…" : "Confirm cancel & refund"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
