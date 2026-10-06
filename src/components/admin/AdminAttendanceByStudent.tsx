"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatDateTime } from "@/lib/classScheduleLabels";
import { AdminListSearch, matchesQuery } from "@/components/admin/AdminListSearch";

interface RosterEntry {
  bookingId: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  status: "SCHEDULED" | "CANCELED" | "COMPLETED";
  attendance: "PRESENT" | "NO_SHOW" | null;
}

interface OccurrenceGroup {
  scheduleId: string;
  label: string | null;
  scheduledAt: string;
  roster: RosterEntry[];
}

type ClassState = "PRESENT" | "NO_SHOW" | "UPCOMING" | "WAITING" | "CANCELED";

interface StudentClass {
  bookingId: string;
  scheduledAt: string;
  label: string | null;
  state: ClassState;
}

interface StudentRow {
  id: string;
  name: string;
  email: string;
  classes: StudentClass[];
  present: number;
  noShow: number;
  upcoming: number;
  canceled: number;
}

const STATE_LABEL: Record<ClassState, string> = {
  PRESENT: "Came",
  NO_SHOW: "No-show",
  UPCOMING: "Upcoming",
  WAITING: "Not marked",
  CANCELED: "Canceled",
};

const STATE_STYLE: Record<ClassState, string> = {
  PRESENT: "bg-emerald-400/15 text-emerald-300",
  NO_SHOW: "bg-red-400/15 text-red-300",
  UPCOMING: "bg-[rgb(var(--signal)/0.14)] text-signal",
  WAITING: "bg-amber-400/15 text-amber-300",
  CANCELED: "bg-neu-base text-slate-500 shadow-pressed-low",
};

function classState(entry: RosterEntry, scheduledAt: string): ClassState {
  if (entry.status === "CANCELED") return "CANCELED";
  if (entry.attendance === "PRESENT") return "PRESENT";
  if (entry.attendance === "NO_SHOW") return "NO_SHOW";
  return new Date(scheduledAt).getTime() > Date.now() ? "UPCOMING" : "WAITING";
}

/** Every student once, with all of their classes under them. */
function groupByStudent(occurrences: OccurrenceGroup[]): StudentRow[] {
  const map = new Map<string, StudentRow>();
  for (const occ of occurrences) {
    for (const entry of occ.roster) {
      let row = map.get(entry.studentId);
      if (!row) {
        row = { id: entry.studentId, name: entry.studentName ?? entry.studentEmail, email: entry.studentEmail, classes: [], present: 0, noShow: 0, upcoming: 0, canceled: 0 };
        map.set(entry.studentId, row);
      }
      const state = classState(entry, occ.scheduledAt);
      row.classes.push({ bookingId: entry.bookingId, scheduledAt: occ.scheduledAt, label: occ.label, state });
      if (state === "PRESENT") row.present++;
      else if (state === "NO_SHOW") row.noShow++;
      else if (state === "UPCOMING") row.upcoming++;
      else if (state === "CANCELED") row.canceled++;
    }
  }
  const rows = Array.from(map.values());
  for (const row of rows) row.classes.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  // Students with a class coming up first, then everyone else by name.
  return rows.sort((a, b) => b.upcoming - a.upcoming || a.name.localeCompare(b.name));
}

export function AdminAttendanceByStudent({ occurrences }: { occurrences: OccurrenceGroup[] }) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const students = groupByStudent(occurrences);
  const shown = students.filter((s) => matchesQuery({ n: s.name, e: s.email }, query));

  if (students.length === 0) {
    return <div className="glass-surface p-8 text-center text-small text-slate-500">No classes booked yet.</div>;
  }

  return (
    <div>
      <AdminListSearch value={query} onChange={setQuery} placeholder="Search a name or email" shown={shown.length} total={students.length} />
      <ul className="space-y-3">
        {shown.map((student) => {
          const open = openId === student.id;
          return (
            <li key={student.id} className="rounded-xl bg-neu-base shadow-raised-low">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : student.id)}
                aria-expanded={open}
                className="tap flex w-full items-center gap-3 rounded-xl p-4 text-left transition hover:shadow-raised-mid active:shadow-pressed-low"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body text-slate-50">{student.name}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-small">
                    <span className={`rounded-full px-2 py-0.5 ${STATE_STYLE.PRESENT}`}>{student.present} came</span>
                    <span className={`rounded-full px-2 py-0.5 ${STATE_STYLE.NO_SHOW}`}>{student.noShow} no-show</span>
                    <span className={`rounded-full px-2 py-0.5 ${STATE_STYLE.UPCOMING}`}>{student.upcoming} upcoming</span>
                    {student.canceled > 0 && <span className={`rounded-full px-2 py-0.5 ${STATE_STYLE.CANCELED}`}>{student.canceled} canceled</span>}
                  </div>
                </div>
                <ChevronRight className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-90" : ""}`} aria-hidden />
              </button>
              {open && (
                <div className="border-t border-slate-50/10 px-4 pb-4 pt-3">
                  <ul className="divide-y divide-slate-50/10">
                    {student.classes.map((c) => (
                      <li key={c.bookingId} className="flex items-center justify-between gap-3 py-2.5 text-small">
                        <span className="min-w-0 truncate text-slate-200">
                          {formatDateTime(c.scheduledAt)}
                          {c.label ? <span className="text-slate-500"> · {c.label}</span> : null}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${STATE_STYLE[c.state]}`}>{STATE_LABEL[c.state]}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={`/admin/users/${student.id}`} className="tap mt-2 inline-flex items-center text-small font-medium text-slate-300 underline underline-offset-2 transition hover:text-slate-100">
                    Open profile
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
