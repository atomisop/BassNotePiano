"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/classScheduleLabels";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/Dialog";

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
}

type Result = { ok: true } | { ok: false; error: string };

export interface StudentSchedulerProps {
  studentId: string;
  studentName: string;
  upcoming: SchedulerBooking[];
  /** Open weekly times, for a one-tap move or a new booking. */
  openSlots: SchedulerSlot[];
  /** The plan's own controls (pause, move the weekly time), drawn by the page. */
  planControls?: React.ReactNode;
  onMove: (bookingId: string, scheduleId: string, occurrenceDateMs: number, chunkIndex: number) => Promise<Result>;
  onMoveToTime: (bookingId: string, date: string, time: string) => Promise<Result>;
  onCancel: (bookingId: string, reason?: string) => Promise<Result>;
  onBook: (studentId: string, scheduleId: string, occurrenceDateMs: number, chunkIndex: number, credits: number) => Promise<Result>;
}

const slotKey = (s: SchedulerSlot) => `${s.scheduleId}:${s.occurrenceDateMs}:${s.chunkIndex}`;

/** Everything about one student's schedule in one place: their classes (move to any date and time, cancel), a new booking, and their plan's weekly time. */
export function StudentScheduler({ studentId, studentName, upcoming, openSlots, planControls, onMove, onMoveToTime, onCancel, onBook }: StudentSchedulerProps) {
  const router = useRouter();
  const [moving, setMoving] = useState<SchedulerBooking | null>(null);
  const [picked, setPicked] = useState<SchedulerSlot | null>(null);
  const [ownDate, setOwnDate] = useState("");
  const [ownTime, setOwnTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [booking, setBooking] = useState<SchedulerSlot | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  function closeMove() {
    if (busy) return;
    setMoving(null);
    setPicked(null);
    setOwnDate("");
    setOwnTime("");
    setError(null);
  }

  const useOwn = Boolean(ownDate && ownTime);

  async function doMove() {
    if (!moving || (!useOwn && !picked)) return;
    setBusy(true);
    setError(null);
    const result = useOwn ? await onMoveToTime(moving.id, ownDate, ownTime) : await onMove(moving.id, picked!.scheduleId, picked!.occurrenceDateMs, picked!.chunkIndex);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setMoving(null);
    setPicked(null);
    setOwnDate("");
    setOwnTime("");
    router.refresh();
  }

  async function doCancel(id: string) {
    setBusy(true);
    setError(null);
    const result = await onCancel(id, reason.trim() || undefined);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setCanceling(null);
    setReason("");
    router.refresh();
  }

  async function doBook() {
    if (!booking) return;
    setBusy(true);
    setBookError(null);
    const result = await onBook(studentId, booking.scheduleId, booking.occurrenceDateMs, booking.chunkIndex, booking.creditCost);
    setBusy(false);
    if (!result.ok) return setBookError(result.error);
    setBooking(null);
    setBookOpen(false);
    router.refresh();
  }

  const field = "min-w-0 flex-1 rounded-lg bg-neu-base px-3 py-2 text-base text-slate-100 shadow-raised-low";

  return (
    <div className="space-y-5">
      {planControls && (
        <div className="glass-surface p-5">
          <h2 className="text-body font-semibold text-slate-50">Plan and weekly time</h2>
          <p className="mt-1 text-small text-slate-500">Pause the plan, or move the standing weekly time and every upcoming class on it together.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">{planControls}</div>
        </div>
      )}

      <div className="glass-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-body font-semibold text-slate-50">Upcoming classes</h2>
          <Button type="button" size="sm" onClick={() => setBookOpen(true)}>
            Book a class
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {upcoming.length === 0 && <p className="text-small text-slate-500">No upcoming classes.</p>}
          {upcoming.map((b) => (
            <div key={b.id} className="rounded-xl bg-neu-base p-3 shadow-raised-low">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-small text-slate-100">{formatDateTime(b.scheduledAt)}</p>
                  <p className="text-small text-slate-500">
                    {b.label ?? "Class"} · {creditsLabelFromStored(b.creditsSpent)}
                  </p>
                </div>
                {canceling !== b.id && (
                  <div className="flex gap-2">
                    <button type="button" className={buttonVariants({ variant: "secondary", size: "sm" })} onClick={() => { setError(null); setMoving(b); }}>
                      Move
                    </button>
                    <button type="button" className={buttonVariants({ variant: "secondary", size: "sm" })} onClick={() => { setError(null); setCanceling(b.id); }}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              {canceling === b.id && (
                <div className="mt-2 flex flex-col gap-2 border-t border-ink/10 pt-2">
                  <input
                    type="text"
                    autoFocus
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason (optional, shown to the student)"
                    className="w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none"
                  />
                  <div className="flex gap-2">
                    <button type="button" className={buttonVariants({ variant: "secondary", size: "sm", className: "flex-1" })} onClick={() => { setCanceling(null); setReason(""); }}>
                      Never mind
                    </button>
                    <button type="button" disabled={busy} onClick={() => doCancel(b.id)} className="tap flex-1 rounded-lg bg-red-500/95 py-1.5 text-small font-semibold text-slate-950 disabled:opacity-50">
                      Confirm cancel and refund
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        {error && !moving && <p role="alert" className="mt-3 text-small text-red-400">{error}</p>}
      </div>

      <Dialog
        open={moving !== null}
        onOpenChange={(open) => {
          if (!open) closeMove();
        }}
        title={`Move ${studentName}'s class`}
        description={moving ? `Now: ${formatDateTime(moving.scheduledAt)}. Pick any date and time below, or an open weekly time. The old time is freed and the new one booked together, or nothing changes.` : undefined}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={closeMove}>
              Never mind
            </Button>
            <Button type="button" disabled={(!useOwn && !picked) || busy} loading={busy} onClick={doMove}>
              {useOwn ? `Move to ${ownDate} at ${ownTime}` : picked ? `Move to ${formatDateTime(picked.scheduledAt)}` : "Pick a time"}
            </Button>
          </div>
        }
      >
        <div className="mb-4 rounded-lg border border-[rgb(var(--c-s-50)/0.15)] p-3">
          <p className="text-small font-medium text-slate-100">Any date and time (Eastern)</p>
          <p className="mt-0.5 text-small text-slate-500">Any future day. The class is 45 minutes and only has to not overlap another class.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input type="date" aria-label="New date" value={ownDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => { setOwnDate(e.target.value); setPicked(null); }} className={field} />
            <input type="time" aria-label="New start time" value={ownTime} step={300} onChange={(e) => { setOwnTime(e.target.value); setPicked(null); }} className={field} />
          </div>
        </div>
        <p className="text-small font-medium text-slate-100">Or an open weekly time</p>
        <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
          {openSlots.length === 0 && <p className="text-small text-slate-500">No open weekly times right now.</p>}
          {openSlots.map((s) => {
            const active = picked ? slotKey(picked) === slotKey(s) : false;
            return (
              <button
                key={slotKey(s)}
                type="button"
                onClick={() => { setPicked(s); setOwnDate(""); setOwnTime(""); }}
                className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-left text-small transition ${active ? "border-[rgb(var(--c-s-50)/0.6)] bg-[rgb(var(--c-s-50)/0.1)]" : "border-transparent bg-neu-base shadow-raised-low"}`}
              >
                <span className={active ? "text-[rgb(var(--c-s-50))]" : "text-slate-100"}>{formatDateTime(s.scheduledAt)}</span>
                <span className="text-slate-500">{s.label ?? "Class"}</span>
              </button>
            );
          })}
        </div>
        {error && <p role="alert" className="mt-3 text-small text-red-400">{error}</p>}
      </Dialog>

      <Dialog
        open={bookOpen}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setBookOpen(false);
            setBooking(null);
            setBookError(null);
          }
        }}
        title={`Book a class for ${studentName}`}
        description="Pick an open weekly time. It uses one class credit, the same as a booking they make themselves."
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => { setBookOpen(false); setBooking(null); }}>
              Never mind
            </Button>
            <Button type="button" disabled={!booking || busy} loading={busy} onClick={doBook}>
              {booking ? `Book ${formatDateTime(booking.scheduledAt)}` : "Pick a time"}
            </Button>
          </div>
        }
      >
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {openSlots.length === 0 && <p className="text-small text-slate-500">No open weekly times right now.</p>}
          {openSlots.map((s) => {
            const active = booking ? slotKey(booking) === slotKey(s) : false;
            return (
              <button
                key={slotKey(s)}
                type="button"
                onClick={() => setBooking(s)}
                className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-left text-small transition ${active ? "border-[rgb(var(--c-s-50)/0.6)] bg-[rgb(var(--c-s-50)/0.1)]" : "border-transparent bg-neu-base shadow-raised-low"}`}
              >
                <span className={active ? "text-[rgb(var(--c-s-50))]" : "text-slate-100"}>{formatDateTime(s.scheduledAt)}</span>
                <span className="text-slate-500">{s.label ?? "Class"}</span>
              </button>
            );
          })}
        </div>
        {bookError && <p role="alert" className="mt-3 text-small text-red-400">{bookError}</p>}
      </Dialog>
    </div>
  );
}
