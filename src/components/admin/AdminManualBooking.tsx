"use client";

import { CLASS_MINUTES } from "@/lib/classCreditPricing";
import { creditsToClasses } from "@/lib/classScheduleLabels";
import { useEffect, useRef, useState } from "react";
import { formatDateTime } from "@/lib/classScheduleLabels";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants, Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/Dialog";
import { holdAppliesTo, holdSlotKey } from "@/lib/slotHolds";

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

/** A weekly time being kept for a contact (see Contacts). Only a reminder: it never blocks a booking. */
export interface SlotHoldInfo {
  contactId: string;
  contactName: string;
  scheduleId: string;
  chunkIndex: number;
  untilMs: number | null;
}

function occurrenceKey(o: OpenOccurrence) {
  return `${o.scheduleId}:${o.occurrenceDateMs}:${o.chunkIndex}`;
}

export interface AdminManualBookingProps {
  openOccurrences: OpenOccurrence[];
  /** Weekly times reserved for contacts; booking over one asks first. */
  holds?: SlotHoldInfo[];
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
export function AdminManualBooking({ openOccurrences, holds = [], onSearchStudents, onBook }: AdminManualBookingProps) {
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
  const [askingHold, setAskingHold] = useState(false);

  /** The contact, if any, this exact weekly hour is reserved for on that date. */
  function heldFor(slot: OpenOccurrence): SlotHoldInfo | null {
    const key = holdSlotKey(slot.scheduleId, slot.chunkIndex);
    return (
      holds.find(
        (hold) =>
          holdSlotKey(hold.scheduleId, hold.chunkIndex) === key &&
          holdAppliesTo({ until: hold.untilMs === null ? null : new Date(hold.untilMs), releasedAt: null }, new Date(slot.occurrenceDateMs)),
      ) ?? null
    );
  }

  // Live, as-you-type, debounced, no more "remember their exact name or
  // email and hit search." An empty query still runs (see
  // searchStudentsForBooking's own comment): it's what populates the
  // initial browsable list on mount and again any time the field is
  // cleared, so there's always something to scroll through instead of a
  // blank state waiting for input.
  const searchSeq = useRef(0);
  useEffect(() => {
    if (student) return;
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await onSearchStudents(query);
      if (seq !== searchSeq.current) return; // a newer keystroke already superseded this request
      setResults(found);
      setSearched(true);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, student]);

  function pickStudent(s: BookableStudent) {
    setStudent(s);
    setSelectedSlot(null);
    setSuccess(null);
    setError(null);
  }

  function pickSlot(slot: OpenOccurrence) {
    setSelectedSlot(slot);
    setCreditsToBook(slot.creditCost);
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

  /** The Book button: a reserved time asks first (the popup below), anything else books straight away. */
  function requestBook() {
    if (!student || !selectedSlot) return;
    if (heldFor(selectedSlot)) setAskingHold(true);
    else void handleBook();
  }

  async function handleBook() {
    if (!student || !selectedSlot) return;
    setAskingHold(false);
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
      <p className="text-small font-medium uppercase tracking-[0.14em] text-slate-400">Book a student</p>

      {success && <p className="mt-3 text-small text-slate-50">{success}</p>}

      {!student ? (
        <>
          <div className="relative mt-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email, or just browse below"
              className="glass-surface-subtle w-full rounded-lg px-3.5 py-2 pr-9 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.5)]"
            />
            {searching && (
              <MorphingSquare size={14} className="absolute right-3 top-1/2 -translate-y-1/2 shrink-0" />
            )}
          </div>

          {searched && !searching && results.length === 0 && (
            <p className="mt-3 text-small text-slate-500">
              {query.trim() ? `No accounts match "${query}".` : "No accounts yet."}
            </p>
          )}

          {results.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-small uppercase tracking-wide text-slate-500">
                {query.trim() ? "Matches" : "Recently active"}
              </p>
              {results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickStudent(s)}
                  className={buttonVariants({ variant: "secondary", className: "w-full justify-between text-left" })}
                >
                  <div>
                    <p className="text-slate-100">{s.name ?? "Unnamed"}</p>
                    <p className="text-small text-slate-500">{s.email}</p>
                  </div>
                  <div className="text-right text-small text-slate-500">
                    <p>{creditsToClasses(s.classCredits)} class{creditsToClasses(s.classCredits) === 1 ? "" : "es"}</p>
                    {!s.hasCurriculumAccess && <p className="text-slate-300">No curriculum access</p>}
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
              <p className="text-small text-slate-100">{student.name ?? student.email}</p>
              <p className="text-small text-slate-500">
                {student.email} · {creditsToClasses(student.classCredits)} class{creditsToClasses(student.classCredits) === 1 ? "" : "es"} available
              </p>
            </div>
            <button type="button" onClick={reset} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Change
            </button>
          </div>

          {!student.hasCurriculumAccess && (
            <p className="mt-3 text-small text-slate-300">
              No curriculum access.
            </p>
          )}

          <p className="mb-2 mt-4 text-small font-medium text-slate-400">Open times</p>
          {openOccurrences.length === 0 ? (
            <p className="text-small text-slate-500">Nothing open right now.</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {openOccurrences.map((slot) => {
                const active = selectedSlot ? occurrenceKey(selectedSlot) === occurrenceKey(slot) : false;
                return (
                  <button
                    key={occurrenceKey(slot)}
                    type="button"
                    onClick={() => pickSlot(slot)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-left text-small transition ${
                      active ? "border-[rgb(var(--c-s-50)/0.6)] bg-[rgb(var(--c-s-50)/0.1)]" : "border-transparent bg-neu-base shadow-raised-low"
                    }`}
                  >
                    <span className={active ? "text-[rgb(var(--c-s-50))]" : "text-slate-100"}>{formatDateTime(slot.scheduledAt)}</span>
                    <span className="text-small text-slate-500">
                      {heldFor(slot) ? <span className="mr-2 font-medium text-signal">Reserved for {heldFor(slot)!.contactName}</span> : null}
                      {slot.label ?? "Class"} · {CLASS_MINUTES} min
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {selectedSlot && (
            <p className="mt-4 text-small text-slate-500">One class, {CLASS_MINUTES} minutes.</p>
          )}

          {error && <p className="mt-3 text-small text-red-400">{error}</p>}

          <button
            type="button"
            onClick={requestBook}
            disabled={!selectedSlot || booking}
            className={buttonVariants({ variant: "primary", className: "mt-4 flex w-full sm:w-auto sm:px-6" })}
          >
            {booking && <MorphingSquare size={14} className="mr-2 shrink-0" />}
            {booking ? "Booking…" : "Book this class"}
          </button>
        </div>
      )}

      <Dialog
        open={askingHold}
        onOpenChange={setAskingHold}
        title="This time is reserved"
        description={
          selectedSlot && heldFor(selectedSlot)
            ? `This slot is reserved for ${heldFor(selectedSlot)!.contactName}${heldFor(selectedSlot)!.untilMs !== null ? ` until ${new Date(heldFor(selectedSlot)!.untilMs!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : ""}. Book ${student?.name ?? student?.email ?? "this student"} anyway?`
            : undefined
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAskingHold(false)}>
              Pick another time
            </Button>
            <Button type="button" onClick={() => void handleBook()}>
              Book anyway
            </Button>
          </div>
        }
      />
    </div>
  );
}
