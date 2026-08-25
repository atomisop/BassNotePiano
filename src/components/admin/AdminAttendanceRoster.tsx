"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RosterEntry {
  bookingId: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  studentImage: string | null;
  status: "SCHEDULED" | "CANCELED" | "COMPLETED";
  attendance: "PRESENT" | "NO_SHOW" | null;
  /** Every student in an occurrence shares the same start time, but can
      book fewer credits than the full window — this is what actually
      differs per student, so it's what tells you when each one leaves. */
  creditsSpent: number;
}

interface OccurrenceGroup {
  scheduleId: string;
  label: string | null;
  dayOfWeek: number;
  occurrenceDateMs: number;
  scheduledAt: string;
  capacity: number;
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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The clock time `creditsSpent` worth of 30-minute chunks past `scheduledAtIso` lands on. */
function formatEndTime(scheduledAtIso: string, creditsSpent: number): string {
  const end = new Date(new Date(scheduledAtIso).getTime() + creditsSpent * 30 * 60_000);
  return end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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
        return (
          <div key={key} className="glass-surface p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-serif text-lg text-slate-50">{occ.label ?? "Class"}</h3>
                <p className="mt-0.5 text-sm text-slate-500">{formatDateTime(occ.scheduledAt)}</p>
              </div>
              <span className="rounded-full border border-ink/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                {activeRoster.length} / {occ.capacity} booked
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {activeRoster.map((entry) => {
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
                          This refunds {entry.studentName ?? "the student"}&apos;s credit and notifies them — no 24-hour
                          cutoff applies to a cancellation you make.
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
        );
      })}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
