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
}

function Avatar({ image, name }: { image: string | null; name: string }) {
  return (
    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/10 bg-slate-800">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-serif text-sm text-amber-300">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function AdminAttendanceRoster({ occurrences, onMarkAttendance }: AdminAttendanceRosterProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleMark(bookingId: string, attendance: "PRESENT" | "NO_SHOW") {
    setBusyId(bookingId);
    try {
      await onMarkAttendance(bookingId, attendance);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (occurrences.length === 0) {
    return <div className="glass-surface backdrop-blur-2xl p-8 text-center text-sm text-slate-500">No bookings in the last 60 days.</div>;
  }

  return (
    <div className="space-y-4">
      {occurrences.map((occ) => {
        const key = `${occ.scheduleId}:${occ.occurrenceDateMs}`;
        const hasHappened = new Date(occ.scheduledAt).getTime() <= Date.now();
        const activeRoster = occ.roster.filter((r) => r.status !== "CANCELED");
        return (
          <div key={key} className="glass-surface backdrop-blur-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-serif text-lg text-slate-50">{occ.label ?? "Class"}</h3>
                <p className="mt-0.5 text-sm text-slate-500">{formatDateTime(occ.scheduledAt)}</p>
              </div>
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                {activeRoster.length} / {occ.capacity} booked
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {activeRoster.map((entry) => (
                <div key={entry.bookingId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
                  <div className="flex items-center gap-3">
                    <Avatar image={entry.studentImage} name={entry.studentName ?? entry.studentEmail} />
                    <div>
                      <p className="text-sm text-slate-100">{entry.studentName ?? "Student"}</p>
                      <p className="text-xs text-slate-600">{entry.studentEmail}</p>
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
                  ) : hasHappened ? (
                    <div className="flex gap-2">
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
                    </div>
                  ) : (
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Upcoming
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
