"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import { setPlanProgressAction } from "@/app/(dashboard)/admin/payment-plans/actions";

/**
 * Owner only, next to the bill date: sets how many bills are paid and the next bill date with no limits (any date, a past one too),
 * for putting a plan back to what is true after something else moved it. Credits and classes are not touched.
 */
export function AdminPlanProgressButton({ planId, billsPaid, termMonths, currentDay, compact = false }: { planId: string; billsPaid: number; termMonths: number; /** YYYY-MM-DD, Eastern. */ currentDay: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paid, setPaid] = useState(billsPaid);
  const [day, setDay] = useState(currentDay);
  const [busy, setBusy] = useState(false);
  const [notify, setNotify] = useNotifyStudent("student-changes");

  async function save() {
    setBusy(true);
    const hold = await toast.held("Setting the plan progress", () => setPlanProgressAction(planId, paid, day, notify).catch(() => ({ ok: false, error: "Something went wrong. Try again.", warning: null as string | null })), { mail: notify });
    setBusy(false);
    if (hold.undone) return;
    const result = hold.value;
    if (!result.ok) return void toast.warning(result.error ?? "Could not save.");
    toast.success(`Plan set to ${paid} of ${termMonths} bills paid`, result.warning ? { description: result.warning } : undefined);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => { setPaid(billsPaid); setDay(currentDay); setOpen(true); }} aria-haspopup="dialog" className={buttonVariants({ variant: "secondary", size: "sm", className: compact ? "h-8 px-2.5" : "" })}>
        <Wrench aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Plan progress
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => !busy && setOpen(next)}
        title="Plan progress"
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
            <NotifyToggle on={notify} onChange={setNotify} className="col-span-2 sm:mr-auto" />
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)} className="w-full sm:w-auto">Never mind</Button>
            <Button type="button" loading={busy} onClick={save} className="w-full sm:w-auto">Save</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-small text-slate-400">Set what is true. Any date works, a past one too. Unpaid bills are closed and the next one is made fresh. Credits and booked classes are not changed.</p>
          <label className="block">
            <span className="mb-1 block text-small font-medium text-slate-200">Bills paid (0 to {termMonths})</span>
            <input type="number" min={0} max={termMonths} value={paid} onChange={(e) => setPaid(Number(e.target.value))} className="min-h-11 w-full rounded-xl bg-neu-base px-3.5 py-2 text-body text-slate-100 shadow-pressed-low" />
          </label>
          <label className="block">
            <span className="mb-1 block text-small font-medium text-slate-200">Next bill date</span>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="min-h-11 w-full rounded-xl bg-neu-base px-3.5 py-2 text-body text-slate-100 shadow-pressed-low" />
          </label>
        </div>
      </Dialog>
    </>
  );
}
