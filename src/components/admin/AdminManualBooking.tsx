"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/classScheduleLabels";
import { MorphingSquare } from "@/components/ui/morphing-square";

interface BookableStudent {
  id: string;
  name: string | null;
  email: string;
  hasCurriculumAccess: boolean;
  classCredits: number;
}

export interface OpenOccurrence {
  scheduleId: string;
  occurrenceDateMs: number;
  chunkIndex: number;
  label: string | null;
  scheduledAt: string;
  creditCost: number;
}

function occurrenceKey(o: OpenOccurrence) {
  return `${o.scheduleId}:${o.occurrenceDateMs}:${o.chunkIndex}`;
}

export interface AdminManualBookingProps {
  openOccurrences: OpenOccurrence[];
  onSearchStudents: (query: string) => Promise<BookableStudent[]>;
  onBook: (
    studentId: string,
    scheduleId: string,
    occurrenceDateMs: number,
    chunkIndex: number,
    creditsToBook: number,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}

/**
 * The "help someone with a booking issue" tool this session's own recent
 * change (bookClass refusing ad hoc self-booking for anyone on an active
 * Payment Plan) made necessary: before this, once that guard shipped, an
 * admin had a cancel button for an existing booking but no way at all to
 * put a student into a *different* open time, only "message support" for
 * the student to say what they need and then... nothing to actually act on
 * it with. This closes that gap directly: pick the student, pick the open
 * time, book it, done, same underlying occurrence list /lessons itself
 * shows, just without the self-service restriction (see adminBookClass in
 * classSchedule.ts).
 */
export function AdminManualBooking({ openOccurrences, onSearchStudents, onBook }: AdminManualBookingProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<BookableStudent[]>([]);
  const [searched, setSearched] = useState(false);
  const [student, setStudent] = useState<BookableStudent | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<OpenOccurrence | null>(null);
  const [creditsToBook, setCreditsToBook] = useState(1);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    const found = await onSearchStudents(query);
    setResults(found);
    setSearched(true);
    setSearching(false);
  }

  function pickStudent(s: BookableStudent) {
    setStudent(s);
    setSelectedSlot(null);
    setSuccess(null);
    setError(null);
  }

  function pickSlot(slot: OpenOccurrence) {
    setSelectedSlot(slot);
    setCreditsToBook(Math.min(slot.creditCost, 2));
    setSuccess(null);
    setError(null);
  }

  function reset() {
    setQuery("");
    setResults([]);
    setSearched(false);
    setStudent(null);
    setSelectedSlot(null);
    setError(null);
  }

  async function handleBook() {
    if (!student || !selectedSlot) return;
    setBooking(true);
    setError(null);
    const result = await onBook(student.id, selectedSlot.scheduleId, selectedSlot.occurrenceDateMs, selectedSlot.chunkIndex, creditsToBook);
    setBooking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(`Booked ${student.name ?? student.email} into ${formatDateTime(selectedSlot.scheduledAt)}.`);
    setStudent(null);
    setSelectedSlot(null);
    setResults([]);
    setQuery("");
    setSearched(false);
  }

  return (
    <div className="glass-surface p-5 sm:p-6">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Book a student</p>
      <p className="mt-1.5 text-sm text-slate-300">
        For a booking issue you&apos;re helping someone with directly, find their account, pick an open time, and book it
        for them. This works even for a student whose Payment Plan otherwise blocks self-booking.
      </p>

      {success && <p className="mt-3 text-xs text-emerald-400">{success}</p>}

      {!student ? (
        <>
          <form onSubmit={handleSearch} className="mt-4 flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email"
              className="glass-surface-subtle flex-1 rounded-lg px-3.5 py-2 text-sm text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.5)]"
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="flex items-center justify-center rounded-lg border border-ink/10 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-[rgb(var(--c-s-50)/0.4)] hover:text-[rgb(var(--c-s-50))] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searching ? <MorphingSquare size={14} /> : "Search"}
            </button>
          </form>

          {searched && results.length === 0 && (
            <p className="mt-3 text-xs text-slate-500">No accounts match &quot;{query}&quot;.</p>
          )}

          {results.length > 0 && (
            <div className="mt-3 space-y-2">
              {results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickStudent(s)}
                  className="flex w-full items-center justify-between rounded-lg border border-ink/10 px-3.5 py-2.5 text-left text-sm transition hover:border-[rgb(var(--c-s-50)/0.4)]"
                >
                  <div>
                    <p className="text-slate-100">{s.name ?? "Unnamed"}</p>
                    <p className="text-xs text-slate-500">{s.email}</p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>{s.classCredits} credit{s.classCredits === 1 ? "" : "s"}</p>
                    {!s.hasCurriculumAccess && <p className="text-amber-400/80">No curriculum access</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="mt-4">
          <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--c-s-50)/0.3)] bg-[rgb(var(--c-s-50)/0.05)] px-3.5 py-2.5">
            <div>
              <p className="text-sm text-slate-100">{student.name ?? student.email}</p>
              <p className="text-xs text-slate-500">
                {student.email} · {student.classCredits} credit{student.classCredits === 1 ? "" : "s"} available
              </p>
            </div>
            <button type="button" onClick={reset} className="text-xs text-slate-500 underline hover:text-slate-300">
              Change
            </button>
          </div>

          {!student.hasCurriculumAccess && (
            <p className="mt-3 text-xs text-amber-400/80">
              This account has no curriculum access yet — booking will still fail server-side without it.
            </p>
          )}

          <p className="mb-2 mt-4 text-xs font-medium text-slate-400">Open times</p>
          {openOccurrences.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing open right now.</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {openOccurrences.map((slot) => {
                const active = selectedSlot ? occurrenceKey(selectedSlot) === occurrenceKey(slot) : false;
                return (
                  <button
                    key={occurrenceKey(slot)}
                    type="button"
                    onClick={() => pickSlot(slot)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-left text-sm transition ${
                      active ? "border-[rgb(var(--c-s-50)/0.6)] bg-[rgb(var(--c-s-50)/0.1)]" : "border-ink/10 hover:border-ink/15"
                    }`}
                  >
                    <span className={active ? "text-[rgb(var(--c-s-50))]" : "text-slate-100"}>{formatDateTime(slot.scheduledAt)}</span>
                    <span className="text-xs text-slate-500">
                      {slot.label ?? "Class"} · up to {slot.creditCost} credit{slot.creditCost === 1 ? "" : "s"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {selectedSlot && selectedSlot.creditCost > 1 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-slate-400">Length</p>
              <div className="flex gap-2">
                {Array.from({ length: selectedSlot.creditCost }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCreditsToBook(n)}
                    className={`rounded-lg border px-3.5 py-2 text-xs font-medium transition ${
                      creditsToBook === n
                        ? "border-[rgb(var(--c-s-50)/0.6)] bg-[rgb(var(--c-s-50)/0.1)] text-[rgb(var(--c-s-50))]"
                        : "border-ink/10 text-slate-300 hover:border-ink/15"
                    }`}
                  >
                    {n * 30} min ({n} credit{n === 1 ? "" : "s"})
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

          <button
            type="button"
            onClick={handleBook}
            disabled={!selectedSlot || booking}
            className="cta-sheen cta-fill mt-4 flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-6"
          >
            {booking && <MorphingSquare size={14} className="mr-2 shrink-0" />}
            {booking ? "Booking…" : "Book this class"}
          </button>
        </div>
      )}
    </div>
  );
}
