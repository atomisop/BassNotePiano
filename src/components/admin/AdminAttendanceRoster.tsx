"use client";

import Link from "next/link";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";
import { Avatar } from "@/components/ui/Avatar";
import { formatEtShort, formatEtEndTime } from "@/lib/classScheduleLabels";
import { Hint } from "@/components/ui/Hint";
import { ViewMore } from "@/components/ui/ViewMore";
import { BookingAttendance } from "@/components/admin/BookingAttendance";
import { CalendarCog } from "lucide-react";

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
  /** Taught in person: no Discord call is made for it. */
  inPerson: boolean;
  /** Shared across every row from the same family booking, null for a solo booking. */
  familyBookingGroupId: string | null;
  focus: RosterFocus;
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
  onUndoAttendance: (bookingId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** The Online / In person switch: in person means no Discord call for that class. */
  onSetInPerson?: (bookingId: string, inPerson: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
}

type Bucket = "needs" | "upcoming" | "done";

function bucketOf(occ: OccurrenceGroup): Bucket {
  const active = occ.roster.filter((r) => r.status !== "CANCELED");
  const happened = new Date(occ.scheduledAt).getTime() <= Date.now();
  if (happened && active.some((r) => r.status === "SCHEDULED" && !r.attendance)) return "needs";
  return happened ? "done" : "upcoming";
}

const SECTIONS: { id: Bucket; title: string; hint: string }[] = [
  { id: "needs", title: "Needs a call", hint: "Classes that already happened and still need Present or No-show. Oldest first." },
  { id: "upcoming", title: "Coming up", hint: "Soonest first." },
  { id: "done", title: "Done", hint: "Already marked. Newest first." },
];

function ClassCard({ occ, onMarkAttendance, onUndoAttendance, onSetInPerson }: { occ: OccurrenceGroup } & Omit<AdminAttendanceRosterProps, "occurrences">) {
  const active = occ.roster.filter((r) => r.status !== "CANCELED");
  const isFamily = active.length > 0 && active[0]!.familyBookingGroupId !== null;
  return (
    <div className="glass-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body font-semibold text-slate-50">{formatEtShort(occ.scheduledAt)}</p>
        <div className="flex items-center gap-1.5">
          {occ.label && <span className="text-small text-slate-500">{occ.label}</span>}
          {active.length > 0 && (
            <span className="rounded-full bg-neu-base px-2.5 py-0.5 text-small font-medium text-slate-300 shadow-raised-low">{isFamily ? `Family · ${active.length}` : "1:1"}</span>
          )}
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        {active.map((entry) => {
          const name = entry.studentName ?? "Student";
          return (
            <div key={entry.bookingId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl bg-neu-base p-2 shadow-raised-low">
              <div className="flex min-w-0 items-center gap-2">
                <Avatar image={entry.studentImage} label={name} size="sm" className="h-8 w-8" />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-small font-medium text-slate-100">
                    {name}
                    <Hint label={`More about ${name}'s class`}>
                      {entry.studentEmail}
                      <br />
                      Until {formatEtEndTime(occ.scheduledAt, entry.creditsSpent)} · {creditsLabelFromStored(entry.creditsSpent)}
                    </Hint>
                  </p>
                  {entry.focus.scaleLabel && (
                    <p className="truncate text-small text-slate-50">
                      {entry.focus.scaleLabel}
                      {entry.focus.action ? ` · ${entry.focus.action}` : ""}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <BookingAttendance
                  bookingId={entry.bookingId}
                  status={entry.status}
                  attendance={entry.attendance}
                  scheduledAt={occ.scheduledAt}
                  creditsSpent={entry.creditsSpent}
                  inPerson={entry.inPerson}
                  onMark={onMarkAttendance}
                  onUndo={onUndoAttendance}
                  onSetInPerson={onSetInPerson}
                />
                {entry.status === "SCHEDULED" && (
                  <Link
                    href={`/admin/users/${entry.studentId}#scheduler`}
                    aria-label={`Open ${name}'s account to move or cancel`}
                    title="Move or cancel in the account"
                    className="tap inline-flex h-8 w-8 items-center justify-center rounded-lg bg-neu-base text-slate-300 shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low"
                  >
                    <CalendarCog aria-hidden className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AdminAttendanceRoster({ occurrences, onMarkAttendance, onUndoAttendance, onSetInPerson }: AdminAttendanceRosterProps) {
  if (occurrences.length === 0) {
    return <div className="glass-surface p-8 text-center text-small text-slate-500">No bookings in the last 60 days.</div>;
  }
  const buckets: Record<Bucket, OccurrenceGroup[]> = { needs: [], upcoming: [], done: [] };
  for (const occ of occurrences) buckets[bucketOf(occ)].push(occ);
  const time = (o: OccurrenceGroup) => new Date(o.scheduledAt).getTime();
  buckets.needs.sort((a, b) => time(a) - time(b));
  buckets.upcoming.sort((a, b) => time(a) - time(b));
  buckets.done.sort((a, b) => time(b) - time(a));

  return (
    <div className="space-y-6">
      {SECTIONS.filter((s) => buckets[s.id].length > 0).map((s) => (
        <section key={s.id}>
          <h2 className="mb-2 flex items-center gap-1 text-small font-semibold uppercase tracking-wide text-slate-400">
            {s.title} · {buckets[s.id].length}
            <Hint label={`About ${s.title}`}>{s.hint}</Hint>
          </h2>
          <div className="space-y-2">
            <ViewMore items={buckets[s.id]} initial={s.id === "done" ? 4 : 6}>
              {(occ) => <ClassCard key={`${occ.scheduleId}:${occ.occurrenceDateMs}`} occ={occ} onMarkAttendance={onMarkAttendance} onUndoAttendance={onUndoAttendance} onSetInPerson={onSetInPerson} />}
            </ViewMore>
          </div>
        </section>
      ))}
    </div>
  );
}
