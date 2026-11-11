"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCog, X } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { formatEtShort } from "@/lib/classScheduleLabels";
import { cancelUpcomingClassesAction, closeStudioDayAction, previewClosedDayAction } from "@/app/(dashboard)/admin/schedule/actions";
import { closeDayMovingClassesAction } from "@/app/(dashboard)/admin/schedule/weeklyTimeActions";
import type { ClosedDayPreview } from "@/lib/adminClassTools";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import { addDaysYmd } from "@/lib/weeklyTimeRules";

const field = "h-11 w-full rounded-control border border-(--field-edge) bg-neu-base px-4 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring";
const easternToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

/** On the student page's Scheduler tab: cancels every upcoming class at once (a student taking a break, moving away...). */
export function AdminCancelAllButton({ userId, firstName, upcoming }: { userId: string; firstName: string; upcoming: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notify, setNotify] = useNotifyStudent("student-changes");
  if (upcoming === 0) return null;

  async function save() {
    setBusy(true);
    const h = await toast.held("Canceling classes", () => cancelUpcomingClassesAction(userId, reason, notify).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." })), { mail: notify });
    if (h.undone) {
      setBusy(false);
      return;
    }
    const result = h.value;
    setBusy(false);
    if (!result.ok) return void toast.warning(result.error);
    toast.success(`${result.count} ${result.count === 1 ? "class" : "classes"} canceled`);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {/* Destructive, so quiet red text, never the loudest button in the row; the dialog is the confirm. */}
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={buttonVariants({ variant: "ghost", size: "sm", className: "h-8 px-2.5 text-red-300 hover:text-red-200" })}>
        <X aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Cancel all upcoming
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title={`Cancel ${firstName}'s upcoming classes`}>
        <NotifyToggle on={notify} onChange={setNotify} className="mb-3" />
        <div className="grid gap-4">
          <p className="text-small text-slate-300">
            All {upcoming} upcoming {upcoming === 1 ? "class is" : "classes are"} canceled. No credits are charged, and their weekly plan does not book those weeks again. Their plan keeps
            running; pause it instead to stop the bills too.
          </p>
          <label className="grid gap-1.5">
            <span className="text-small font-medium text-slate-200">Reason (they see it if Notify is on)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Canceled by the studio" className={field} />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className={buttonVariants({ variant: "secondary" })}>
              Keep them
            </button>
            <button type="button" disabled={busy} onClick={() => void save()} aria-busy={busy} className={buttonVariants({ variant: "danger" })}>
              {busy && <MorphingSquare size={14} className="mr-2 shrink-0" />}
              Cancel {upcoming} {upcoming === 1 ? "class" : "classes"}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/**
 * On Schedule: closes the studio for a day (a holiday, a sick day). Shows the classes it cancels before anything changes. "Move them
 * instead" keeps those classes: all to another day at their own times, or a day and time picked per class; then the day closes. Each
 * student is told once (Notify).
 */
export function AdminCloseDay() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<ClosedDayPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notify, setNotify] = useNotifyStudent("attendance");
  // "Move them instead": where each class goes (an Eastern date and start time), and the one day they all go to by default.
  const [moving, setMoving] = useState(false);
  const [allTo, setAllTo] = useState("");
  const [moves, setMoves] = useState<Record<string, { date: string; time: string }>>({});
  const [key, setKey] = useState(() => newIdempotencyKey());

  async function pick(next: string, keepMoving = false) {
    setDate(next);
    setPreview(null);
    if (!keepMoving) setMoving(false);
    if (!next) return;
    setLoading(true);
    const result = await previewClosedDayAction(next).catch(() => ({ ok: false as const, error: "Could not look that day up." }));
    setLoading(false);
    if (!result.ok) return void toast.warning(result.error);
    setPreview(result.preview);
    if (keepMoving) setMoves((m) => Object.fromEntries(result.preview.classes.map((c) => [c.id, m[c.id] ?? { date: allTo, time: c.time }])));
  }

  function startMoving() {
    if (!preview) return;
    const to = addDaysYmd(date, 1);
    setAllTo(to);
    setMoves(Object.fromEntries(preview.classes.map((c) => [c.id, { date: to, time: c.time }])));
    setMoving(true);
  }

  function moveAllTo(next: string) {
    setAllTo(next);
    setMoves((m) => Object.fromEntries(Object.entries(m).map(([id, v]) => [id, { ...v, date: next }])));
  }

  async function saveMoves() {
    if (!preview) return;
    setBusy(true);
    const list = preview.classes.map((c) => ({ bookingId: c.id, date: moves[c.id]?.date ?? "", time: moves[c.id]?.time ?? "" }));
    const h = await toast.held("Moving the classes", () => closeDayMovingClassesAction(date, reason, list, key, notify).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." })), { mail: notify });
    setBusy(false);
    if (h.undone) return;
    const result = h.value;
    setKey(newIdempotencyKey());
    if (!result.ok) {
      toast.warning(result.error);
      // Some classes may have moved before the one that could not: look at the day again, keeping the times already picked.
      await pick(date, true);
      router.refresh();
      return;
    }
    toast.success(`${result.moved} ${result.moved === 1 ? "class" : "classes"} moved, and ${result.label} is closed`);
    setOpen(false);
    router.refresh();
  }

  async function save() {
    setBusy(true);
    const h = await toast.held("Closing the day", () => closeStudioDayAction(date, reason, notify).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." })), { mail: notify });
    if (h.undone) {
      setBusy(false);
      return;
    }
    const result = h.value;
    setBusy(false);
    if (!result.ok) return void toast.warning(result.error);
    toast.success(`${result.label} is closed${result.canceled ? `, ${result.canceled} ${result.canceled === 1 ? "class" : "classes"} canceled` : ""}`);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDate("");
          setReason("");
          setPreview(null);
          setMoving(false);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "text-red-300 hover:text-red-200" })}
      >
        <CalendarCog aria-hidden className="h-4 w-4" />
        Close a day
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title="Close the studio for a day">
        <NotifyToggle on={notify} onChange={setNotify} label="Notify the students" className="mb-3" />
        <div className="grid gap-4">
          <p className="text-small text-slate-400">Every class that day is canceled with no credit charged, or moved to another day if you pick Move them instead. The day is kept so nobody books it. Open it again by releasing it under Reserved.</p>
          <label className="grid gap-1.5">
            <span className="text-small font-medium text-slate-200">Day</span>
            <input type="date" value={date} min={easternToday()} onChange={(e) => void pick(e.target.value)} className={field} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-small font-medium text-slate-200">Reason (students see it if Notify is on)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Holiday" className={field} />
          </label>
          {loading && (
            <div className="inline-flex items-center gap-2 text-small text-slate-400">
              <MorphingSquare size={12} />
              Looking at that day
            </div>
          )}
          {preview && !moving && (
            <div className="rounded-xl bg-neu-base p-3 text-small shadow-pressed-low">
              {preview.classes.length === 0 ? (
                <p className="text-slate-300">No classes are booked on {preview.label}.</p>
              ) : (
                <>
                  <p className="font-medium text-slate-200">
                    {preview.classes.length} {preview.classes.length === 1 ? "class" : "classes"} will be canceled on {preview.label}:
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-slate-400">
                    {preview.classes.map((c) => (
                      <li key={c.id}>
                        {formatEtShort(c.scheduledAt, { weekday: false })}, {c.student}
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={startMoving} className="tap mt-2 inline-flex items-center text-small font-medium text-signal-fg underline underline-offset-4">
                    Move them instead
                  </button>
                </>
              )}
            </div>
          )}
          {preview && moving && (
            <div className="grid gap-3 rounded-xl bg-neu-base p-3 text-small shadow-pressed-low">
              <label className="grid gap-1.5">
                <span className="font-medium text-slate-200">Move them all to</span>
                <input type="date" value={allTo} min={easternToday()} onChange={(e) => moveAllTo(e.target.value)} className={field} />
                <span className="text-caption text-slate-400">Each keeps its own time. Change a day or time below for one class.</span>
              </label>
              <ul className="grid gap-3">
                {preview.classes.map((c) => (
                  <li key={c.id} className="grid gap-1.5">
                    <span className="text-slate-200">
                      {c.student} <span className="text-slate-500">· now {formatEtShort(c.scheduledAt, { weekday: false })}</span>
                    </span>
                    <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                      <input type="date" aria-label={`New day for ${c.student}`} value={moves[c.id]?.date ?? ""} onChange={(e) => setMoves((m) => ({ ...m, [c.id]: { date: e.target.value, time: m[c.id]?.time ?? c.time } }))} className={field} />
                      <input type="time" step={300} aria-label={`New time for ${c.student}`} value={moves[c.id]?.time ?? ""} onChange={(e) => setMoves((m) => ({ ...m, [c.id]: { date: m[c.id]?.date ?? allTo, time: e.target.value } }))} className={field} />
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setMoving(false)} className="tap inline-flex items-center justify-self-start text-small text-slate-300 underline underline-offset-4">
                Cancel them instead
              </button>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className={buttonVariants({ variant: "secondary" })}>
              Cancel
            </button>
            {moving && preview ? (
              <button type="button" disabled={busy || preview.classes.some((c) => !moves[c.id]?.date || !moves[c.id]?.time)} onClick={() => void saveMoves()} aria-busy={busy} className={buttonVariants({ variant: "primary" })}>
                {busy && <MorphingSquare size={14} className="mr-2 shrink-0" />}
                Move {preview.classes.length} and close {preview.label.split(",")[0]}
              </button>
            ) : (
              <button type="button" disabled={busy || !preview} onClick={() => void save()} aria-busy={busy} className={buttonVariants({ variant: "danger" })}>
                {busy && <MorphingSquare size={14} className="mr-2 shrink-0" />}
                {preview ? `Close ${preview.label}` : "Close the day"}
              </button>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
