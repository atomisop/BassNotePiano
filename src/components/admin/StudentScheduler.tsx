"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, X } from "@/components/ui/appIcons";
import { formatEtShort } from "@/lib/classScheduleLabels";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";
import { Button, buttonVariants } from "@/components/ui/button";
import { Meta } from "@/components/ui/CardKit";
import { Dialog } from "@/components/ui/Dialog";
import { ViewMore } from "@/components/ui/ViewMore";
import { SlotCalendarPicker, type BookedTime } from "@/components/admin/SlotCalendarPicker";
import { toast } from "@/components/ui/Toaster";
import { BookingAttendance } from "@/components/admin/BookingAttendance";
import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { adminBookAtSlotAction, adminBookClassAtTimeAction } from "@/app/(dashboard)/admin/schedule/actions";
import { addCreditLabel, etTodayKey, nextBookingAsk, offDayQuestion, typedTimeLabel, type BookingAsk } from "@/lib/adminBookingRules";
import { newIdempotencyKey } from "@/lib/idempotencyClient";

export interface SchedulerSlot {
  scheduleId: string;
  occurrenceDateMs: number;
  chunkIndex: number;
  label: string | null;
  scheduledAt: string;
  creditCost: number;
  /** Another student's weekly plan keeps this time (free this week, but moving here needs a yes). */
  heldBy?: string;
  /** The owner kept this time for this student. */
  reservedForThem?: boolean;
  /** A contact's soft hold on this weekly time (their name): booking over it needs a yes. */
  heldFor?: string;
}

export interface SchedulerBooking {
  id: string;
  label: string | null;
  scheduledAt: string;
  creditsSpent: number;
  status: "SCHEDULED" | "CANCELED" | "COMPLETED";
  attendance: "PRESENT" | "NO_SHOW" | null;
  inPerson: boolean;
}

type Result = { ok: true } | { ok: false; error: string; planHold?: boolean };
type OpenTimes = { open: SchedulerSlot[]; held?: SchedulerSlot[]; booked: BookedTime[]; weekdays: number[] };

export interface StudentSchedulerProps {
  studentId: string;
  studentName: string;
  bookings: SchedulerBooking[];
  /** The plan's own controls (pause, move the weekly time), drawn by the page. */
  planControls?: React.ReactNode;
  /** The times to pick from, read as this student sees them (their own reserved time is open to them). */
  loadOpenSlots: (studentId?: string) => Promise<OpenTimes>;
  onMove: (bookingId: string, scheduleId: string, occurrenceDateMs: number, chunkIndex: number, notify?: boolean, overridePlanHold?: boolean) => Promise<Result>;
  onMoveToTime: (bookingId: string, date: string, time: string, notify?: boolean, overridePlanHold?: boolean) => Promise<Result>;
  onCancel: (bookingId: string, reason?: string, notify?: boolean) => Promise<Result>;
  /** No longer used: Book runs through adminBookAtSlotAction and adminBookClassAtTimeAction (any time, walk-ins, adding a credit). */
  onBook?: (studentId: string, scheduleId: string, occurrenceDateMs: number, chunkIndex: number, credits: number, notify?: boolean) => Promise<Result>;
  onMark: (bookingId: string, attendance: "PRESENT" | "NO_SHOW", notify?: boolean) => Promise<void>;
  onUndo: (bookingId: string, notify?: boolean) => Promise<Result>;
  onSetInPerson: (bookingId: string, inPerson: boolean, notify?: boolean) => Promise<Result>;
}

const iconBtn = "tap inline-flex h-8 items-center justify-center gap-1 rounded-full bg-neu-base px-2.5 text-small font-medium text-slate-200 shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low disabled:opacity-50";

/** One question before a booking or a move runs (see nextBookingAsk). */
function AskCard({ title, warn = false, children }: { title: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-control p-4 ${warn ? "bg-amber-300/10 ring-1 ring-inset ring-amber-300/20" : "lgx-row"}`}>
      <p className="text-body font-semibold text-slate-50">{title}</p>
      <p className="mt-1 text-small text-slate-300">{children}</p>
    </div>
  );
}

/**
 * One student's whole schedule on one screen: their classes (attendance, reschedule, cancel), a new booking, and the plan's weekly time.
 * Reschedule (the arrows) is on every class not yet marked Present or No-show, past ones too, and can put it on a past day: a class
 * booked on the wrong day is moved to the right one and marked there, with no refund and re-charge. Undo a mark first to move a marked class.
 * Book a class works the same way: any weekly time (a plan's or a held one after a yes), or any day and typed start time, made on the
 * spot. A past day records a class already taught and marks it Present. No free credit? The owner adds one and books in one tap.
 */
export function StudentScheduler(props: StudentSchedulerProps) {
  const { studentId, studentName, bookings, loadOpenSlots, onMove, onMoveToTime, onCancel, onMark, onUndo, onSetInPerson } = props;
  const router = useRouter();
  const first = studentName.split(" ")[0] || studentName;
  // One "Notify student" switch for everything on this card (reschedule, cancel, book, attendance); off by default.
  const [notify, setNotify] = useNotifyStudent("student-changes");
  const [times, setTimes] = useState<OpenTimes | null>(null);
  const [slotsBusy, setSlotsBusy] = useState(false);
  const [moving, setMoving] = useState<SchedulerBooking | null>(null);
  const [picked, setPicked] = useState<SchedulerSlot | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [ownTime, setOwnTime] = useState("");
  // Questions answered yes for the current Reschedule choice, and the one being asked now.
  const [moveAcks, setMoveAcks] = useState<Set<BookingAsk>>(new Set());
  const [moveAsk, setMoveAsk] = useState<BookingAsk | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<SchedulerBooking | null>(null);
  const [reason, setReason] = useState("");
  const [bookOpen, setBookOpen] = useState(false);
  const [booking, setBooking] = useState<SchedulerSlot | null>(null);
  const [bookDay, setBookDay] = useState<string | null>(null);
  const [bookTime, setBookTime] = useState("");
  const [bookAcks, setBookAcks] = useState<Set<BookingAsk>>(new Set());
  const [bookAsk, setBookAsk] = useState<BookingAsk | null>(null);
  // The student has no free credit: how much they are short, and whether this admin (the owner) can add it here.
  const [short, setShort] = useState<{ shortBy: number; canAdd: boolean } | null>(null);
  const [bookKey, setBookKey] = useState(() => newIdempotencyKey());
  const now = Date.now();
  const time = (b: SchedulerBooking) => new Date(b.scheduledAt).getTime();
  const active = bookings.filter((b) => b.status === "SCHEDULED");
  const needs = active.filter((b) => time(b) <= now && !b.attendance).sort((a, b) => time(a) - time(b));
  const upcoming = active.filter((b) => time(b) > now).sort((a, b) => time(a) - time(b));
  const history = bookings.filter((b) => !(b.status === "SCHEDULED" && (time(b) > now || !b.attendance))).sort((a, b) => time(b) - time(a));

  // A new choice of day or time starts its questions over.
  useEffect(() => {
    setMoveAcks(new Set());
    setMoveAsk(null);
  }, [day, picked, ownTime]);
  useEffect(() => {
    setBookAcks(new Set());
    setBookAsk(null);
    setShort(null);
  }, [bookDay, booking, bookTime]);

  async function ensureSlots() {
    if (times || slotsBusy) return;
    setSlotsBusy(true);
    try {
      setTimes(await loadOpenSlots(studentId));
    } catch {
      toast.error("Could not load the open times.");
    } finally {
      setSlotsBusy(false);
    }
  }
  // The one "Book a class" button lives in the profile's top row and asks this card to open its box.
  const ensureSlotsRef = useRef(ensureSlots);
  ensureSlotsRef.current = ensureSlots;
  useEffect(() => {
    const open = () => {
      setError(null);
      setBookOpen(true);
      void ensureSlotsRef.current();
    };
    window.addEventListener("bnp-open-book-class", open);
    return () => window.removeEventListener("bnp-open-book-class", open);
  }, []);

  function openMove(b: SchedulerBooking) {
    setError(null);
    setMoving(b);
    void ensureSlots();
  }

  function closeMove() {
    if (busy) return;
    setMoving(null);
    setPicked(null);
    setDay(null);
    setOwnTime("");
    setMoveAsk(null);
    setError(null);
  }

  const weekdays = times?.weekdays ?? [];
  const useOwn = Boolean(day && ownTime && !picked);

  async function doMove(acks: Set<BookingAsk>) {
    if (!moving || (!useOwn && !picked)) return;
    const ask = nextBookingAsk(acks, { typed: useOwn, day, time: ownTime, weekdays, heldBy: picked?.heldBy, heldFor: picked?.heldFor, recordPast: false });
    if (ask) return setMoveAsk(ask);
    const overridePlanHold = acks.has("plan");
    setBusy(true);
    setError(null);
    const result = useOwn
      ? await onMoveToTime(moving.id, day!, ownTime, notify, overridePlanHold)
      : await onMove(moving.id, picked!.scheduleId, picked!.occurrenceDateMs, picked!.chunkIndex, notify, overridePlanHold);
    setBusy(false);
    if (!result.ok) {
      // A typed time that lands on a plan's weekly time is only found out by the server: ask the same question, then try again.
      if (result.planHold && !overridePlanHold) return setMoveAsk("plan");
      return setError(result.error);
    }
    toast.success("Class rescheduled.");
    setMoving(null);
    setPicked(null);
    setDay(null);
    setOwnTime("");
    setMoveAsk(null);
    setTimes(null);
    router.refresh();
  }

  function answerMove() {
    if (!moveAsk) return;
    const next = new Set(moveAcks).add(moveAsk);
    setMoveAcks(next);
    setMoveAsk(null);
    void doMove(next);
  }

  async function doCancel() {
    if (!canceling) return;
    setBusy(true);
    const hold = await toast.held("Canceling the class", () => onCancel(canceling.id, reason.trim() || undefined, notify), { mail: notify });
    setBusy(false);
    if (hold.undone) return;
    const result = hold.value;
    if (!result.ok) return setError(result.error);
    toast.success("Class canceled and refunded.");
    setCanceling(null);
    setReason("");
    setError(null);
    setTimes(null);
    router.refresh();
  }

  const bookTyped = Boolean(bookDay && bookTime && !booking);
  const bookPastDay = Boolean(bookDay && bookDay < etTodayKey());

  function closeBook() {
    if (busy) return;
    setBookOpen(false);
    setBooking(null);
    setBookDay(null);
    setBookTime("");
    setBookAsk(null);
    setShort(null);
    setError(null);
  }

  async function doBook(acks: Set<BookingAsk>, addCredit = false) {
    if (!bookTyped && !booking) return;
    const ask = nextBookingAsk(acks, { typed: bookTyped, day: bookDay, time: bookTime, weekdays, heldBy: booking?.heldBy, heldFor: booking?.heldFor, recordPast: true });
    if (ask) return setBookAsk(ask);
    const opts = { overridePlanHold: acks.has("plan"), addCredit, key: bookKey };
    setBusy(true);
    setError(null);
    let result: Awaited<ReturnType<typeof adminBookAtSlotAction>>;
    try {
      result = bookTyped
        ? await adminBookClassAtTimeAction(studentId, bookDay!, bookTime, opts, notify)
        : await adminBookAtSlotAction(studentId, { scheduleId: booking!.scheduleId, occurrenceDateMs: booking!.occurrenceDateMs, chunkIndex: booking!.chunkIndex }, opts, notify);
    } catch {
      result = { ok: false, error: "Something went wrong. Try again." };
    }
    setBusy(false);
    if (!result.ok) {
      if (result.planHold && !acks.has("plan")) return setBookAsk("plan");
      setShort(result.shortBy ? { shortBy: result.shortBy, canAdd: Boolean(result.canAddCredit) } : null);
      return setError(result.error);
    }
    const added = result.creditsAdded > 0 ? ` ${creditsLabelFromStored(result.creditsAdded)} added.` : "";
    toast.success(`${result.walkIn ? "Class recorded and marked Present." : "Class booked."}${added}`);
    setBookKey(newIdempotencyKey());
    setBookOpen(false);
    setBooking(null);
    setBookDay(null);
    setBookTime("");
    setTimes(null);
    router.refresh();
  }

  function answerBook() {
    if (!bookAsk) return;
    const next = new Set(bookAcks).add(bookAsk);
    setBookAcks(next);
    setBookAsk(null);
    void doBook(next);
  }

  // Each class is a row (date first and bright, credits and label quiet, the tools on the right), not a pile of equal boxes.
  const row = (b: SchedulerBooking, actions: boolean) => (
    <div key={b.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5">
      <div className="min-w-0">
        <p className={`text-body font-medium tabular-nums ${b.status === "CANCELED" ? "text-slate-400" : "text-slate-50"}`}>{formatEtShort(b.scheduledAt)}</p>
        <Meta items={[b.status === "CANCELED" ? "Canceled" : creditsLabelFromStored(b.creditsSpent), b.label]} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <BookingAttendance
          bookingId={b.id}
          status={b.status}
          attendance={b.attendance}
          scheduledAt={b.scheduledAt}
          creditsSpent={b.creditsSpent}
          inPerson={b.inPerson}
          onMark={(id, a) => onMark(id, a, notify)}
          onUndo={(id) => onUndo(id, notify)}
          onSetInPerson={(id, v) => onSetInPerson(id, v, notify)}
        />
        {b.status === "SCHEDULED" && !b.attendance && (
          <button type="button" className={`${iconBtn} w-8 px-0`} onClick={() => openMove(b)} aria-label="Reschedule this class" title="Reschedule">
            <ArrowRightLeft aria-hidden className="h-4 w-4" />
          </button>
        )}
        {actions && (
          // Destructive, so quiet red text, never the loudest thing on the row; the dialog still asks first.
          <button
            type="button"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "gap-1 text-red-300 hover:text-red-200" })}
            onClick={() => {
              setError(null);
              setCanceling(b);
            }}
            aria-label="Cancel this class"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
            Cancel
          </button>
        )}
      </div>
    </div>
  );

  const slotsReady = times?.open ?? [];
  const heldReady = times?.held ?? [];
  const bookedReady = (times?.booked ?? []).filter((b) => b.id !== moving?.id);
  const planName = (slot: SchedulerSlot | null) => (slot?.heldBy ? `${slot.heldBy}'s` : "Another student's");

  // The question being asked, worded for Reschedule or Book.
  const askCard = (ask: BookingAsk, mode: "move" | "book") => {
    const slot = mode === "move" ? picked : booking;
    const d = (mode === "move" ? day : bookDay) ?? "";
    const t = mode === "move" ? ownTime : bookTime;
    const verb = mode === "move" ? `move ${first}'s class` : `book ${first}`;
    if (ask === "offday") return <AskCard title="Not a usual teaching day" warn>{offDayQuestion(d)}</AskCard>;
    if (ask === "past")
      return (
        <AskCard title="This time has passed">
          Record a class {first} already took on {typedTimeLabel(d, t)}? It is booked and marked Present, which uses 1 credit.
        </AskCard>
      );
    if (ask === "new")
      return (
        <AskCard title="This time does not exist yet">
          {typedTimeLabel(d, t)} is not one of your weekly times. Create it as a one-time slot and {verb} there?
        </AskCard>
      );
    if (ask === "plan")
      return (
        <AskCard title={slot?.heldBy ? `This is ${slot.heldBy}'s weekly time` : "This time belongs to a weekly plan"} warn>
          {planName(slot)} plan keeps this time, though nobody has a class in it that week. {mode === "move" ? `Move ${first}'s class here anyway?` : `Book ${first} anyway?`} Their plan keeps the time for its other weeks.
        </AskCard>
      );
    return (
      <AskCard title={`Held for ${slot?.heldFor ?? "a contact"}`} warn>
        You are holding this time for {slot?.heldFor ?? "a contact"}. {mode === "move" ? `Move ${first}'s class here anyway?` : `Book ${first} anyway?`} The hold stays.
      </AskCard>
    );
  };
  const askYes: Record<BookingAsk, string> = { offday: "Yes, use it", past: "Yes, record it", new: "Yes, create it", plan: "Yes, use it anyway", contact: "Yes, use it anyway" };
  const next = upcoming[0];
  const groupTitle = "flex items-center gap-1.5 text-caption font-medium uppercase tracking-caps";
  const countPill = "min-w-6 rounded-full bg-slate-50/8 px-1.5 py-0.5 text-center text-caption font-semibold tabular-nums text-slate-200";

  return (
    <div className="glass-surface space-y-5 p-4 md:p-5">
      {/* The one loud line: when the next class is. Everything under it is a list. */}
      <div>
        <p className="text-caption font-medium uppercase tracking-caps text-slate-500">Next class</p>
        <p className={`mt-1 text-title font-semibold tabular-nums ${next ? "text-slate-50" : "text-slate-400"}`}>{next ? formatEtShort(next.scheduledAt) : "Nothing booked"}</p>
        {next && <Meta className="mt-0.5" items={[creditsLabelFromStored(next.creditsSpent), next.label, upcoming.length > 1 ? `${upcoming.length - 1} more booked` : null]} />}
      </div>

      {needs.length > 0 && (
        <section className="rounded-control bg-amber-300/6 px-3 pt-2.5 ring-1 ring-inset ring-amber-300/20">
          <h2 className={`${groupTitle} text-amber-300`}>
            Needs a call
            <span className={countPill}>{needs.length}</span>
          </h2>
          <div className="divide-y divide-slate-50/6">
            <ViewMore items={needs} initial={4}>{(b) => row(b, false)}</ViewMore>
          </div>
        </section>
      )}

      <section className="border-t border-slate-50/8 pt-4">
        <h2 className={`${groupTitle} text-slate-500`}>
          Upcoming
          <span className={countPill}>{upcoming.length}</span>
        </h2>
        <div className="divide-y divide-slate-50/6">
          {upcoming.length === 0 && <p className="py-2.5 text-small text-slate-500">Nothing booked.</p>}
          <ViewMore items={upcoming} initial={4}>{(b) => row(b, true)}</ViewMore>
        </div>
      </section>

      {history.length > 0 && (
        <section className="border-t border-slate-50/8 pt-4">
          <h2 className={`${groupTitle} text-slate-500`}>
            History
            <span className={countPill}>{history.length}</span>
          </h2>
          <div className="divide-y divide-slate-50/6">
            <ViewMore items={history} initial={3}>{(b) => row(b, false)}</ViewMore>
          </div>
        </section>
      )}

      <Dialog
        open={moving !== null}
        onOpenChange={(open) => {
          if (!open) closeMove();
        }}
        title={`Reschedule ${studentName}'s class`}
        description={moving ? `Now: ${formatEtShort(moving.scheduledAt)}` : undefined}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            {moveAsk ? (
              <>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setMoveAsk(null)}>
                  Back
                </Button>
                <Button type="button" disabled={busy} loading={busy} onClick={answerMove}>
                  {askYes[moveAsk]}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="secondary" disabled={busy} onClick={closeMove}>
                  Never mind
                </Button>
                <Button type="button" disabled={(!useOwn && !picked) || busy} loading={busy} onClick={() => void doMove(moveAcks)}>
                  {useOwn ? `Reschedule to ${typedTimeLabel(day!, ownTime)}` : picked ? `Reschedule to ${formatEtShort(picked.scheduledAt)}` : "Pick a time"}
                </Button>
              </>
            )}
          </div>
        }
      >
        <NotifyToggle on={notify} onChange={setNotify} label={`Notify ${first}`} className="mb-3" />
        {moveAsk ? (
          askCard(moveAsk, "move")
        ) : times === null ? (
          <p className="text-small text-slate-500">Loading open times…</p>
        ) : (
          <SlotCalendarPicker slots={slotsReady} booked={bookedReady} weekdays={weekdays} allowAnyDay allDays namedHolds allowPast held={heldReady} day={day} onDay={setDay} picked={picked} onPick={setPicked} ownTime={ownTime} onOwnTime={setOwnTime} />
        )}
        {error && <p role="alert" className="mt-3 text-small text-red-400">{error}</p>}
      </Dialog>

      <Dialog
        open={bookOpen}
        onOpenChange={(open) => {
          if (!open) closeBook();
        }}
        title={`Book a class for ${studentName}`}
        description="Pick a time, or tap any day and type a start time. It uses one class credit."
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            {bookAsk ? (
              <>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setBookAsk(null)}>
                  Back
                </Button>
                <Button type="button" disabled={busy} loading={busy} onClick={answerBook}>
                  {askYes[bookAsk]}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="secondary" disabled={busy} onClick={closeBook}>
                  Never mind
                </Button>
                {short?.canAdd ? (
                  // The owner fixes the cause here: the credit is added (audited, like Add credits) and the class booked in one tap.
                  <Button type="button" disabled={busy} loading={busy} onClick={() => void doBook(bookAcks, true)}>
                    {addCreditLabel(short.shortBy, bookTyped && bookPastDay ? "record" : "book")}
                  </Button>
                ) : (
                  <Button type="button" disabled={(!bookTyped && !booking) || busy} loading={busy} onClick={() => void doBook(bookAcks)}>
                    {booking ? `Book ${formatEtShort(booking.scheduledAt)}` : bookTyped ? `${bookPastDay ? "Record" : "Book"} ${typedTimeLabel(bookDay!, bookTime)}` : "Pick a time"}
                  </Button>
                )}
              </>
            )}
          </div>
        }
      >
        <NotifyToggle on={notify} onChange={setNotify} label={`Notify ${first}`} className="mb-3" />
        {bookAsk ? (
          askCard(bookAsk, "book")
        ) : times === null ? (
          <p className="text-small text-slate-500">Loading open times…</p>
        ) : (
          <>
            <SlotCalendarPicker
              slots={slotsReady}
              booked={times.booked}
              weekdays={weekdays}
              allowAnyDay
              allDays
              allowPast
              namedHolds
              held={heldReady}
              day={bookDay}
              onDay={setBookDay}
              picked={booking}
              onPick={setBooking}
              ownTime={bookTime}
              onOwnTime={setBookTime}
            />
            {bookPastDay && <p className="mt-2 text-small text-slate-400">A past day records a class {first} already took. It is marked Present.</p>}
          </>
        )}
        {error && <p role="alert" className="mt-3 text-small text-red-400">{error}</p>}
      </Dialog>

      <Dialog
        open={canceling !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setCanceling(null);
            setReason("");
            setError(null);
          }
        }}
        title="Cancel this class?"
        description={canceling ? `${formatEtShort(canceling.scheduledAt)}. The student is told and the credit is refunded.` : undefined}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => { setCanceling(null); setReason(""); }}>
              Keep it
            </Button>
            <Button type="button" variant="danger" disabled={busy} loading={busy} onClick={doCancel}>
              Cancel class
            </Button>
          </div>
        }
      >
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional, shown to the student)" className="w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none" />
        {error && <p role="alert" className="mt-3 text-small text-red-400">{error}</p>}
      </Dialog>
    </div>
  );
}
