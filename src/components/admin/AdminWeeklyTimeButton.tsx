"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { moveWeeklyTimeAction, weeklyTimeChoicesAction } from "@/app/(dashboard)/admin/payment-plans/actions";
import type { WeeklyTimeChoice } from "@/lib/adminWeeklyTime";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Next to Pause on the student page: moves this person's standing weekly class, and every upcoming class on it, to another free time.
 * Works on a group or parent plan too, since each person on one has their own weekly time.
 */
export function AdminWeeklyTimeButton({ planId, compact = false }: { planId: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<WeeklyTimeChoice | null>(null);
  const [choices, setChoices] = useState<WeeklyTimeChoice[]>([]);
  const [pick, setPick] = useState("");
  const [notify, setNotify] = useNotifyStudent("student-changes");

  async function show() {
    setOpen(true);
    setLoading(true);
    setPick("");
    const result = await weeklyTimeChoicesAction(planId).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setLoading(false);
    if (!result.ok) {
      toast.warning(result.error);
      setOpen(false);
      return;
    }
    setCurrent(result.current);
    setChoices(result.choices);
  }

  async function save() {
    const chosen = choices.find((c) => `${c.scheduleId}:${c.chunkIndex}` === pick);
    if (!chosen) return;
    setBusy(true);
    const result = await moveWeeklyTimeAction(planId, chosen.scheduleId, chosen.chunkIndex, notify).catch(() => ({ ok: false, error: "Something went wrong. Try again.", label: undefined }));
    setBusy(false);
    if (!result.ok) {
      toast.warning(result.error ?? "Could not move the weekly time.");
      return;
    }
    toast.success(`Weekly time is now ${result.label ?? chosen.label}`);
    setOpen(false);
    router.refresh();
  }

  const byDay = DAYS.map((day, i) => ({ day, items: choices.filter((c) => c.dayOfWeek === i) })).filter((g) => g.items.length > 0);

  return (
    <>
      <button type="button" onClick={() => void show()} aria-haspopup="dialog" className={buttonVariants({ variant: "secondary", size: "sm", className: compact ? "h-8 px-2.5" : "" })}>
        <Clock aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Weekly time
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title="Move the weekly time">
        <NotifyToggle on={notify} onChange={setNotify} className="mb-3" />
        <div className="grid gap-4">
          <p className="text-small text-slate-400">
            {current ? `Now ${current.label}.` : "No weekly time yet."} Every upcoming class moves to the new time, and later months are booked there as they are paid. Classes
            already taught stay where they are. The student is told only if Notify is on.
          </p>
          {loading ? (
            <div className="inline-flex items-center gap-2 text-small text-slate-400">
              <MorphingSquare size={12} />
              Finding free times
            </div>
          ) : choices.length === 0 ? (
            <p className="text-small text-slate-300">No other weekly time is free. Add one on Classes &gt; Schedule first.</p>
          ) : (
            <label className="grid gap-1.5">
              <span className="text-small font-medium text-slate-200">New weekly time</span>
              <select
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className="h-11 rounded-control border border-(--field-edge) bg-neu-base px-4 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Pick a time</option>
                {byDay.map((g) => (
                  <optgroup key={g.day} label={g.day}>
                    {g.items.map((c) => (
                      <option key={`${c.scheduleId}:${c.chunkIndex}`} value={`${c.scheduleId}:${c.chunkIndex}`}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className={buttonVariants({ variant: "secondary" })}>
              Cancel
            </button>
            <button type="button" disabled={busy || !pick} onClick={() => void save()} aria-busy={busy} className={buttonVariants({ variant: "primary" })}>
              {busy && <MorphingSquare size={14} className="mr-2 shrink-0" />}
              Move every class
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
