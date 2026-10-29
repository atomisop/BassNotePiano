"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, Pencil, Undo2, Video, X } from "lucide-react";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";

type Result = { ok: true } | { ok: false; error: string };

export interface BookingAttendanceProps {
  bookingId: string;
  status: "SCHEDULED" | "CANCELED" | "COMPLETED";
  attendance: "PRESENT" | "NO_SHOW" | null;
  scheduledAt: string;
  creditsSpent: number;
  inPerson: boolean;
  onMark: (bookingId: string, attendance: "PRESENT" | "NO_SHOW") => Promise<void>;
  onUndo: (bookingId: string) => Promise<Result>;
  onSetInPerson?: (bookingId: string, inPerson: boolean) => Promise<Result>;
}

const icon = "tap inline-flex h-8 items-center justify-center gap-1 rounded-lg px-2.5 text-small font-medium shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low disabled:opacity-50";

/**
 * Everything you do about one class's attendance, in one compact line: Online / In person, Present, No-show, and (once marked) edit or undo.
 * The attendance list and each student's Scheduler tab both draw this, so there is one place to change how it works.
 */
export function BookingAttendance({ bookingId, status, attendance, scheduledAt, creditsSpent, inPerson, onMark, onUndo, onSetInPerson }: BookingAttendanceProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [mode, setMode] = useState<boolean | null>(null);

  const start = new Date(scheduledAt).getTime();
  const hasHappened = start <= Date.now();
  const inPersonShown = mode ?? inPerson;

  async function mark(next: "PRESENT" | "NO_SHOW") {
    setBusy(true);
    try {
      await onMark(bookingId, next);
      setEditing(false);
      router.refresh();
    } catch {
      toast.error("Could not save attendance.");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    setBusy(true);
    const result = await onUndo(bookingId);
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    setEditing(false);
    setConfirmUndo(false);
    router.refresh();
  }

  async function toggleMode() {
    if (!onSetInPerson) return;
    const next = !inPersonShown;
    setMode(next);
    const result = await onSetInPerson(bookingId, next);
    if (!result.ok) {
      setMode(!next);
      return toast.error(result.error);
    }
    router.refresh();
  }

  if (status !== "SCHEDULED" && !attendance) return null;

  const markButtons = (
    <>
      <button type="button" disabled={busy || attendance === "PRESENT"} onClick={() => mark("PRESENT")} className={`${icon} bg-neu-base text-slate-100`} aria-label="Mark present">
        {busy ? <MorphingSquare size={11} /> : <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />}
        Present
      </button>
      <button type="button" disabled={busy || attendance === "NO_SHOW"} onClick={() => mark("NO_SHOW")} className={`${icon} bg-neu-base text-red-400`} aria-label="Mark no-show">
        <X aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />
        No-show
      </button>
    </>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {onSetInPerson && status === "SCHEDULED" && !attendance && Date.now() < start + 45 * 60_000 && (
        <>
          <button
            type="button"
            onClick={toggleMode}
            aria-pressed={inPersonShown}
            aria-label={inPersonShown ? "In person. Tap to switch to online." : "Online. Tap to switch to in person."}
            className={`${icon} ${inPersonShown ? "bg-[rgb(var(--c-s-50)/0.12)] text-[rgb(var(--c-s-50))]" : "bg-neu-base text-slate-300"}`}
          >
            {inPersonShown ? <MapPin aria-hidden className="h-3.5 w-3.5" /> : <Video aria-hidden className="h-3.5 w-3.5" />}
            {inPersonShown ? "In person" : "Online"}
          </button>
        </>
      )}

      {attendance && !editing && (
        <>
          <span className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-small font-medium ${attendance === "PRESENT" ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-400"}`}>
            {attendance === "PRESENT" ? <Check aria-hidden className="h-3.5 w-3.5" /> : <X aria-hidden className="h-3.5 w-3.5" />}
            {attendance === "PRESENT" ? "Present" : "No-show"}
          </span>
          <button type="button" onClick={() => setEditing(true)} aria-label="Edit attendance" className={`${icon} w-8 bg-neu-base px-0 text-slate-300`}>
            <Pencil aria-hidden className="h-3.5 w-3.5" />
          </button>
        </>
      )}

      {attendance && editing && (
        <>
          {confirmUndo ? (
            <>
              <span className="text-small text-slate-300">Refund {creditsLabelFromStored(creditsSpent)}?</span>
              <button type="button" onClick={() => setConfirmUndo(false)} disabled={busy} className={`${icon} bg-neu-base text-slate-300`}>
                Keep
              </button>
              <button type="button" onClick={undo} disabled={busy} className={`${icon} bg-[rgb(var(--c-s-50))] text-slate-950`}>
                {busy && <MorphingSquare size={11} />}
                Undo and refund
              </button>
            </>
          ) : (
            <>
              {markButtons}
              <button type="button" onClick={() => setConfirmUndo(true)} disabled={busy} className={`${icon} bg-neu-base text-slate-300`} aria-label="Undo attendance and refund">
                <Undo2 aria-hidden className="h-3.5 w-3.5" />
                Undo
              </button>
              <button type="button" onClick={() => setEditing(false)} className={`${icon} bg-neu-base text-slate-500`}>
                Done
              </button>
            </>
          )}
        </>
      )}

      {!attendance && status === "SCHEDULED" && hasHappened && markButtons}
    </div>
  );
}
