"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { editPaymentAction } from "@/app/(dashboard)/admin/users/[userId]/actions";

const field = "h-11 w-full rounded-control border border-(--field-edge) bg-neu-base px-4 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

/** Owner only, on an approved payment in the student's Payment history: corrects the amount or the day the money arrived. */
export function AdminEditPaymentButton({ paymentId, amountCents, paidAt }: { paymentId: string; amountCents: number; paidAt: Date }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);

  function show() {
    setAmount((amountCents / 100).toFixed(2));
    setDay(ymd(new Date(paidAt)));
    setOpen(true);
  }

  async function save() {
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || amount.trim() === "") return void toast.warning("Type the amount, like 169.99.");
    setBusy(true);
    const result = await editPaymentAction(paymentId, cents, day).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setBusy(false);
    if (!result.ok) return void toast.warning(result.error);
    toast.success(result.message);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={show} aria-haspopup="dialog" aria-label="Correct this payment" className={buttonVariants({ variant: "ghost", size: "sm", className: "shrink-0 gap-1" })}>
        <Pencil aria-hidden className="h-3.5 w-3.5" />
        Fix
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title="Correct this payment">
        <div className="grid gap-4">
          <p className="text-small text-slate-400">For a payment recorded with the wrong amount or day. Only the record changes: the classes and credits it paid for stay as they are. The student is not told, and the change is in the activity log.</p>
          <label className="grid gap-1.5">
            <span className="text-small font-medium text-slate-200">Amount (dollars)</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={field} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-small font-medium text-slate-200">Day the money arrived</span>
            <input type="date" value={day} max={ymd(new Date())} onChange={(e) => setDay(e.target.value)} className={field} />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className={buttonVariants({ variant: "secondary" })}>
              Cancel
            </button>
            <button type="button" disabled={busy || !day} onClick={() => void save()} aria-busy={busy} className={buttonVariants({ variant: "primary" })}>
              {busy && <MorphingSquare size={14} className="mr-2 shrink-0" />}
              Save
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
