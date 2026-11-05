"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, CalendarPlus, X } from "@/components/ui/appIcons";
import { formatEtShort } from "@/lib/classScheduleLabels";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/Dialog";
import { Hint } from "@/components/ui/Hint";
import { ViewMore } from "@/components/ui/ViewMore";
import { SlotCalendarPicker, type BookedTime } from "@/components/admin/SlotCalendarPicker";
import { toast } from "@/components/ui/Toaster";
import { BookingAttendance } from "@/components/admin/BookingAttendance";
import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";

export interface SchedulerSlot {
  scheduleId: string;
  occurrenceDateMs: number;
  chunkIndex: number;
  label: string | null;
  scheduledAt: string;
  creditCost: number;
  /** Another student's weekly plan keeps this time (free this week, but moving here needs a yes). */
  heldBy?: string;
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

export interface StudentSchedulerProps {
  studentId: string;
  studentName: string;
  bookings: SchedulerBooking[];
  /** The plan's own controls (pause, move the weekly time), drawn by the page. */
  planControls?: React.ReactNode;
  loadOpenSlots: () => Promise<{ open: SchedulerSlot[]; held?: SchedulerSlot[]; booked: BookedTime[]; weekdays: number[] }>;
  onMove: (bookingId: string, scheduleId: string, occurrenceDateMs: number, chunkIndex: number, notify?: boolean, overridePlanHold?: boolean) => Promise<Result>;
  onMoveToTime: (bookingId: string, date: string, time: string, notify?: boolean, overridePlanHold?: boolean) => Promise<Result>;
  onCancel: (bookingId: string, reason?: string, notify?: boolean) => Promise<Result>;
  onBook: (studentId: string, scheduleId: string, occurrenceDateMs: number, chunkIndex: number, credits: number, notify?: boolean) => Promise<Result>;
  onMark: (bookingId: string, attendance: "PRESENT" | "NO_SHOW", notify?: boolean) => Promise<void>;
  onUndo: (bookingId: string, notify?: boolean) => Promise<Result>;
  onSetInPerson: (bookingId: string, inPerson: boolean, notify?: boolean) => Promise<Result>;
}

const iconBtn = "tap inline-flex h-8 items-center justify-center gap-1 rounded-full bg-neu-base px-2.5 text-small font-medium text-slate-200 shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low disabled:opacity-50";

/**
 * One student's whole schedule on one screen: their classes (attendance, reschedule, cancel), a new booking, and the plan's weekly time.
 * Reschedule (the arrows) is on every class not yet marked Present or No-show, past ones too, and can put it on a past day: a class
 * booked on the wrong day is moved to the right one and marked there, with no refund and re-charge. Undo a mark first to move a marked class.
 */
export function StudentScheduler(props: StudentSchedulerProps) {
  const { studentId, studentName, bookings, planControls, loadOpenSlots, onMove, onMoveToTime, onCancel, onBook, onMark, onUndo, onSetInPerson } = props;
  const router = useRouter();
  // One "Notify student" switch for everything on this card (reschedule, cancel, book, attendance); off by default.
  const [notify, setNotify] = useNotifyStudent("student-changes");
  const [times, setTimes] = useState<{ open: SchedulerSlot[]; held?: SchedulerSlot[]; booked: BookedTime[]; weekdays: number[] } | null>(null);
  const [slotsBusy, setSlotsBusy] = useState(false);
  const [moving, setMoving] = useState<SchedulerBooking | null>(null);
  const [picked, setPicked] = useState<SchedulerSlot | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [ownTime, setOwnTime] = useState("");
  const [bookDay, setBookDay] = useState<string | null>(null);
  // A typed time is not one of the weekly times, so moving there creates a new one-off time: ask first.
  const [confirmNew, setConfirmNew] = useState(false);
  // The time chosen is kept by another student's weekly plan: ask once, then move over it. Holds the holder's name (or a generic line for a typed time).
  const [planHold, setPlanHold] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<SchedulerBooking | null>(null);
  const [reason, setReason] = useState("");
  const [booking, setBooking] = useState<SchedulerSlot | null>(null);
  const [bookOpen, setBookOpen] = useState(false);

  const now = Date.now();
  const time = (b: SchedulerBooking) => new Date(b.scheduledAt).getTime();
  const active = bookings.filter((b) => b.status === "SCHEDULED");
  const needs = active.filter((b) => time(b) <= now && !b.attendance).sort((a, b) => time(a) - time(b));
  const upcoming = active.filter((b) => time(b) > now).sort((a, b) => time(a) - time(b));
  const history = bookings.filter((b) => !(b.status === "SCHEDULED" && (time(b) > now || !b.attendance))).sort((a, b) => time(b) - time(a));

  async function ensureSlots() {
    if (times || slotsBusy) return;
    setSlotsBusy(true);
    try {
      setTimes(await loadOpenSlots());
    } catch {
      toast.error("Could not load the open times.");
    } finally {
      setSlotsBusy(false);
    }
  }

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
    setConfirmNew(false);
    setPlanHold(null);
    setError(null);
  }

  const useOwn = Boolean(day && ownTime && !picked);

  async function doMove(overridePlanHold = false) {
    if (!moving || (!useOwn && !picked)) return;
    if (useOwn && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    if (!useOwn && picked?.heldBy && !overridePlanHold) {
      setPlanHold(picked.heldBy);
      return;
    }
    setBusy(true);
    setError(null);
    const result = useOwn
      ? await onMoveToTime(moving.id, day!, ownTime, notify, overridePlanHold)
      : await onMove(moving.id, picked!.scheduleId, picked!.occurrenceDateMs, picked!.chunkIndex, notify, overridePlanHold);
    setBusy(false);
    if (!result.ok) {
      // A typed time that lands on a plan's weekly time is only found out by the server: ask the same question, then try again.
      if (result.planHold && !overridePlanHold) {
        setPlanHold("another student");
        return;
      }
      return setError(result.error);
    }
    toast.success("Class rescheduled.");
    setMoving(null);
    setPicked(null);
    setDay(null);
    setOwnTime("");
    setConfirmNew(false);
    setPlanHold(null);
    setTimes(null);
    router.refresh();
  }

  async function doCancel() {
    if (!canceling) return;
    setBusy(true);
    const result = await onCancel(canceling.id, reason.trim() || undefined, notify);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    toast.success("Class canceled and refunded.");
    setCanceling(null);
    setReason("");
    setError(null);
    setTimes(null);
    router.refresh();
  }

  async function doBook() {
    if (!booking) return;
    setBusy(true);
    setError(null);
    const result = await onBook(studentId, booking.scheduleId, booking.occurrenceDateMs, booking.chunkIndex, booking.creditCost, notify);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    toast.success("Class booked.");
    setBooking(null);
    setBookDay(null);
    setBookOpen(false);
    setTimes(null);
    router.refresh();
  }

  const row = (b: SchedulerBooking, actions: boolean) => (
    <div key={b.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl bg-neu-base p-2 shadow-raised-low">
      <div className="min-w-0 pl-1">
        <p className="text-small font-semibold text-slate-50">{formatEtShort(b.scheduledAt)}</p>
        <p className="text-small text-slate-500">
          {b.status === "CANCELED" ? "Canceled" : creditsLabelFromStored(b.creditsSpent)}
          {b.label ? ` · ${b.label}` : ""}
        </p>
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
          <>
            <button type="button" className="tap inline-flex h-8 items-center justify-center gap-1 rounded-full bg-red-600 px-2.5 text-small font-semibold text-white shadow-raised-low transition hover:bg-red-500 active:shadow-pressed-low" onClick={() => { setError(null); setCanceling(b); }} aria-label="Cancel this class">
              <X aria-hidden className="h-3.5 w-3.5" />
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );

  const slotsReady = times?.open ?? [];
  const heldReady = times?.held ?? [];
  const bookedReady = (times?.booked ?? []).filter((b) => b.id !== moving?.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {planControls}
          {planControls && <Hint label="About plan controls">Pause the plan, move the standing weekly time and every upcoming class on it together, or (owner) move the next bill to another day.</Hint>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NotifyToggle on={notify} onChange={setNotify} label={`Notify ${studentName.split(" ")[0]}`} />
          <Button type="button" size="sm" onClick={() => { setError(null); setBookOpen(true); void ensureSlots(); }}>
            <CalendarPlus aria-hidden className="mr-1 h-4 w-4" />
            Book a class
          </Button>
        </div>
      </div>

      {needs.length > 0 && (
        <section>
          <h2 className="mb-1.5 flex items-center gap-1 text-small font-semibold uppercase tracking-wide text-amber-300">
            Needs a call · {needs.length}
            <Hint label="About needs a call">These classes already happened and still need Present or No-show. Oldest first. Booked on the wrong day? Reschedule it with the arrows, then mark it.</Hint>
          </h2>
          <div className="space-y-1.5">
            <ViewMore items={needs} initial={4}>{(b) => row(b, false)}</ViewMore>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-1.5 text-small font-semibold uppercase tracking-wide text-slate-400">Upcoming · {upcoming.length}</h2>
        <div className="space-y-1.5">
          {upcoming.length === 0 && <p className="text-small text-slate-500">Nothing booked.</p>}
          <ViewMore items={upcoming} initial={4}>{(b) => row(b, true)}</ViewMore>
        </div>
      </section>

      {history.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-small font-semibold uppercase tracking-wide text-slate-400">History · {history.length}</h2>
          <div className="space-y-1.5">
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
            {planHold ? (
              <>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setPlanHold(null)}>
                  Back
                </Button>
                <Button type="button" disabled={busy} loading={busy} onClick={() => void doMove(true)}>
                  Yes, move it here
                </Button>
              </>
            ) : confirmNew ? (
              <>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirmNew(false)}>
                  Back
                </Button>
                <Button type="button" disabled={busy} loading={busy} onClick={() => void doMove()}>
                  Yes, create it and reschedule
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="secondary" disabled={busy} onClick={closeMove}>
                  Never mind
                </Button>
                <Button type="button" disabled={(!useOwn && !picked) || busy} loading={busy} onClick={() => void doMove()}>
                  {useOwn ? `Reschedule to ${day} at ${ownTime}` : picked ? `Reschedule to ${formatEtShort(picked.scheduledAt)}` : "Pick a time"}
                </Button>
              </>
            )}
          </div>
        }
      >
        {planHold ? (
          <div className="rounded-xl border border-amber-300/40 bg-neu-base shadow-pressed-low p-4">
            <p className="text-body font-semibold text-slate-50">This time belongs to a weekly plan</p>
            <p className="mt-1 text-small text-slate-300">
              {planHold === "another student" ? "Another student's" : `${planHold}'s`} plan keeps this weekly time, though nobody has a class in it this week. Move {studentName}&apos;s class here anyway? Their plan keeps the time for its other weeks.
            </p>
          </div>
        ) : confirmNew ? (
          <div className="rounded-xl border border-slate-50/35 bg-neu-base shadow-pressed-low p-4">
            <p className="text-body font-semibold text-slate-50">This time does not exist yet</p>
            <p className="mt-1 text-small text-slate-300">
              {day} at {ownTime} is not one of your weekly times. Create it as a one-time slot and reschedule {studentName} there?
            </p>
          </div>
        ) : times === null ? (
          <p className="text-small text-slate-500">Loading open times…</p>
        ) : (
          <SlotCalendarPicker slots={slotsReady} booked={bookedReady} weekdays={times?.weekdays ?? []} allowAnyDay allowPast held={heldReady} day={day} onDay={setDay} picked={picked} onPick={setPicked} ownTime={ownTime} onOwnTime={setOwnTime} />
        )}
        {error && <p role="alert" className="mt-3 text-small text-red-400">{error}</p>}
      </Dialog>

      <Dialog
        open={bookOpen}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setBookOpen(false);
            setBooking(null);
            setBookDay(null);
            setError(null);
          }
        }}
        title={`Book a class for ${studentName}`}
        description="Pick an open weekly time. It uses one class credit."
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => { setBookOpen(false); setBooking(null); }}>
              Never mind
            </Button>
            <Button type="button" disabled={!booking || busy} loading={busy} onClick={doBook}>
              {booking ? `Book ${formatEtShort(booking.scheduledAt)}` : "Pick a time"}
            </Button>
          </div>
        }
      >
        {times === null ? (
          <p className="text-small text-slate-500">Loading open times…</p>
        ) : (
          <SlotCalendarPicker slots={slotsReady} booked={[]} weekdays={[]} allowAnyDay={false} day={bookDay} onDay={setBookDay} picked={booking} onPick={setBooking} ownTime="" onOwnTime={() => {}} />
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
