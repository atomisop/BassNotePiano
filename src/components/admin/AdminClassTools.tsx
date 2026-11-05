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
import type { ClosedDayPreview } from "@/lib/adminClassTools";

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
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={buttonVariants({ variant: "secondary", size: "sm", className: "h-8 px-2.5" })}>
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

/** On Schedule: closes the studio for a day (a holiday, a sick day). Shows the classes it cancels before anything changes. */
export function AdminCloseDay() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<ClosedDayPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notify, setNotify] = useNotifyStudent("attendance");

  async function pick(next: string) {
    setDate(next);
    setPreview(null);
    if (!next) return;
    setLoading(true);
    const result = await previewClosedDayAction(next).catch(() => ({ ok: false as const, error: "Could not look that day up." }));
    setLoading(false);
    if (!result.ok) return void toast.warning(result.error);
    setPreview(result.preview);
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
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        <CalendarCog aria-hidden className="h-4 w-4" />
        Close a day
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title="Close the studio for a day">
        <NotifyToggle on={notify} onChange={setNotify} label="Notify the students" className="mb-3" />
        <div className="grid gap-4">
          <p className="text-small text-slate-400">Every class that day is canceled with no credit charged, and the day is kept so nobody books it. Open it again by releasing it under Reserved.</p>
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
          {preview && (
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
                </>
              )}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className={buttonVariants({ variant: "secondary" })}>
              Cancel
            </button>
            <button type="button" disabled={busy || !preview} onClick={() => void save()} aria-busy={busy} className={buttonVariants({ variant: "danger" })}>
              {busy && <MorphingSquare size={14} className="mr-2 shrink-0" />}
              {preview ? `Close ${preview.label}` : "Close the day"}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
