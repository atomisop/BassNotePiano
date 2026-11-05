"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { changeBillDateAction } from "@/app/(dashboard)/admin/payment-plans/actions";

const easternToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

/**
 * Owner only, next to Pause on the student page: moves the plan's next bill to another day, for fixing a date that went wrong.
 * The box says what changes (the bill date only) before anything is saved.
 */
export function AdminBillDateButton({ planId, currentDay, compact = false }: { planId: string; /** YYYY-MM-DD, Eastern. */ currentDay: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(currentDay);
  const [busy, setBusy] = useState(false);
  const [notify, setNotify] = useNotifyStudent("student-changes");
  const pretty = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

  async function save() {
    setBusy(true);
    const hold = await toast.held("Moving the next bill", () => changeBillDateAction(planId, day, notify).catch(() => ({ ok: false, error: "Something went wrong. Try again." })), { mail: notify });
    setBusy(false);
    if (hold.undone) return;
    const result = hold.value;
    if (!result.ok) {
      toast.warning(result.error ?? "Could not change the date.");
      return;
    }
    toast.success(`Next bill is now ${pretty(day)}`);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDay(currentDay);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className={buttonVariants({ variant: "secondary", size: "sm", className: compact ? "h-8 px-2.5" : "" })}
      >
        <CalendarClock aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Bill date
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title="Move the next bill">
        <NotifyToggle on={notify} onChange={setNotify} className="mb-3" />
        <div className="grid gap-4">
          <p className="text-small text-slate-400">
            Now due {pretty(currentDay)}. Only the bill date changes: credits, classes and the weekly time stay as they are. The student is told only if Notify is on.
          </p>
          <label className="grid gap-1.5">
            <span className="text-small font-medium text-slate-200">New date</span>
            <input
              type="date"
              value={day}
              min={easternToday()}
              onChange={(e) => setDay(e.target.value)}
              className="h-11 rounded-control border border-(--field-edge) bg-neu-base px-4 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className={buttonVariants({ variant: "secondary" })}>
              Cancel
            </button>
            <button type="button" disabled={busy || !day || day === currentDay} onClick={() => void save()} aria-busy={busy} className={buttonVariants({ variant: "primary" })}>
              {busy && <MorphingSquare size={14} className="mr-2 shrink-0" />}
              {day && day !== currentDay ? `Move to ${pretty(day)}` : "Move bill"}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
