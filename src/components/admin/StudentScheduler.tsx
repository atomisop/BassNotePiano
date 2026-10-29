"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, CalendarPlus, X } from "lucide-react";
import { formatEtShort } from "@/lib/classScheduleLabels";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/Dialog";
import { Hint } from "@/components/ui/Hint";
import { ViewMore } from "@/components/ui/ViewMore";
import { SlotCalendarPicker, type BookedTime } from "@/components/admin/SlotCalendarPicker";
import { toast } from "@/components/ui/Toaster";
import { BookingAttendance } from "@/components/admin/BookingAttendance";

export interface SchedulerSlot {
  scheduleId: string;
  occurrenceDateMs: number;
  chunkIndex: number;
  label: string | null;
  scheduledAt: string;
  creditCost: number;
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

type Result = { ok: true } | { ok: false; error: string };

export interface StudentSchedulerProps {
  studentId: string;
  studentName: string;
  bookings: SchedulerBooking[];
  /** The plan's own controls (pause, move the weekly time), drawn by the page. */
  planControls?: React.ReactNode;
  loadOpenSlots: () => Promise<{ open: SchedulerSlot[]; booked: BookedTime[]; weekdays: number[] }>;
  onMove: (bookingId: string, scheduleId: string, occurrenceDateMs: number, chunkIndex: number) => Promise<Result>;
  onMoveToTime: (bookingId: string, date: string, time: string) => Promise<Result>;
  onCancel: (bookingId: string, reason?: string) => Promise<Result>;
  onBook: (studentId: string, scheduleId: string, occurrenceDateMs: number, chunkIndex: number, credits: number) => Promise<Result>;
  onMark: (bookingId: string, attendance: "PRESENT" | "NO_SHOW") => Promise<void>;
  onUndo: (bookingId: string) => Promise<Result>;
  onSetInPerson: (bookingId: string, inPerson: boolean) => Promise<Result>;
}

const iconBtn = "tap inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-neu-base px-2.5 text-small font-medium text-slate-200 shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low disabled:opacity-50";

/** One student's whole schedule on one screen: their classes (attendance, move, cancel), a new booking, and the plan's weekly time. */
export function StudentScheduler(props: StudentSchedulerProps) {
  const { studentId, studentName, bookings, planControls, loadOpenSlots, onMove, onMoveToTime, onCancel, onBook, onMark, onUndo, onSetInPerson } = props;
  const router = useRouter();
  const [times, setTimes] = useState<{ open: SchedulerSlot[]; booked: BookedTime[]; weekdays: number[] } | null>(null);
  const [slotsBusy, setSlotsBusy] = useState(false);
  const [moving, setMoving] = useState<SchedulerBooking | null>(null);
  const [picked, setPicked] = useState<SchedulerSlot | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [ownTime, setOwnTime] = useState("");
  const [bookDay, setBookDay] = useState<string | null>(null);
  // A typed time is not one of the weekly times, so moving there creates a new one-off time: ask first.
  const [confirmNew, setConfirmNew] = useState(false);
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
    setError(null);
  }

  const useOwn = Boolean(day && ownTime && !picked);

  async function doMove() {
    if (!moving || (!useOwn && !picked)) return;
    if (useOwn && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    setBusy(true);
    setError(null);
    const result = useOwn ? await onMoveToTime(moving.id, day!, ownTime) : await onMove(moving.id, picked!.scheduleId, picked!.occurrenceDateMs, picked!.chunkIndex);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    toast.success("Class moved.");
    setMoving(null);
    setPicked(null);
    setDay(null);
    setOwnTime("");
    setConfirmNew(false);
    setTimes(null);
    router.refresh();
  }

  async function doCancel() {
    if (!canceling) return;
    setBusy(true);
    const result = await onCancel(canceling.id, reason.trim() || undefined);
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
    const result = await onBook(studentId, booking.scheduleId, booking.occurrenceDateMs, booking.chunkIndex, booking.creditCost);
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
          onMark={onMark}
          onUndo={onUndo}
          onSetInPerson={onSetInPerson}
        />
        {actions && (
          <>
            <button type="button" className={iconBtn} onClick={() => openMove(b)} aria-label="Move this class">
              <ArrowRightLeft aria-hidden className="h-3.5 w-3.5" />
              Move
            </button>
            <button type="button" className={`${iconBtn} text-red-400`} onClick={() => { setError(null); setCanceling(b); }} aria-label="Cancel this class">
              <X aria-hidden className="h-3.5 w-3.5" />
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );

  const slotsReady = times?.open ?? [];
  const bookedReady = (times?.booked ?? []).filter((b) => b.id !== moving?.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {planControls}
          {planControls && <Hint label="About plan controls">Pause the plan, or move the standing weekly time and every upcoming class on it together.</Hint>}
        </div>
        <Button type="button" size="sm" onClick={() => { setError(null); setBookOpen(true); void ensureSlots(); }}>
          <CalendarPlus aria-hidden className="mr-1 h-4 w-4" />
          Book a class
        </Button>
      </div>

      {needs.length > 0 && (
        <section>
          <h2 className="mb-1.5 flex items-center gap-1 text-small font-semibold uppercase tracking-wide text-amber-300">
            Needs a call · {needs.length}
            <Hint label="About needs a call">These classes already happened and still need Present or No-show. Oldest first.</Hint>
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
        title={`Move ${studentName}'s class`}
        description={moving ? `Now: ${formatEtShort(moving.scheduledAt)}` : undefined}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            {confirmNew ? (
              <>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirmNew(false)}>
                  Back
                </Button>
                <Button type="button" disabled={busy} loading={busy} onClick={doMove}>
                  Yes, create it and move
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="secondary" disabled={busy} onClick={closeMove}>
                  Never mind
                </Button>
                <Button type="button" disabled={(!useOwn && !picked) || busy} loading={busy} onClick={doMove}>
                  {useOwn ? `Move to ${day} at ${ownTime}` : picked ? `Move to ${formatEtShort(picked.scheduledAt)}` : "Pick a time"}
                </Button>
              </>
            )}
          </div>
        }
      >
        {confirmNew ? (
          <div className="rounded-xl border border-[rgb(var(--c-s-50)/0.35)] bg-neu-base shadow-pressed-low p-4">
            <p className="text-body font-semibold text-slate-50">This time does not exist yet</p>
            <p className="mt-1 text-small text-slate-300">
              {day} at {ownTime} is not one of your weekly times. Create it as a one-time slot and move {studentName} there?
            </p>
          </div>
        ) : times === null ? (
          <p className="text-small text-slate-500">Loading open times…</p>
        ) : (
          <SlotCalendarPicker slots={slotsReady} booked={bookedReady} weekdays={times?.weekdays ?? []} allowAnyDay day={day} onDay={setDay} picked={picked} onPick={setPicked} ownTime={ownTime} onOwnTime={setOwnTime} />
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
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional, shown to the student)" className="w-full glass-surface-subtle px-3 py-2 text-base text-slate-100 outline-none" />
        {error && <p role="alert" className="mt-3 text-small text-red-400">{error}</p>}
      </Dialog>
    </div>
  );
}
