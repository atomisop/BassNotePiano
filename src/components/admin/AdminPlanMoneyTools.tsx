"use client";

import { cn } from "@/lib/utils";
import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Coins, Hourglass, Send } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import { formatEtShort } from "@/lib/classScheduleLabels";
import type { PlanFix } from "@/lib/planFixes";
import type { LateSettlementPreview } from "@/lib/lateSettlement";
import { PlanFixPanel } from "@/components/admin/PlanFixPanel";
import { cancelPaymentPlanAction, lateSettlementPreviewAction, recordPlanPaymentAction, resendBillAction, settleLatePaymentAction } from "@/app/(dashboard)/admin/payment-plans/actions";

/**
 * The money jobs Billing > Plans offers, on the person's own page (inside its Plan menu): send the open bill again, record a payment that
 * arrived another way, settle a late payer in one step, and cancel the plan. Each is the same action the Plans screen uses.
 */

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const menuButton = (compact: boolean) => buttonVariants({ variant: "secondary", size: "sm", className: compact ? "h-8 px-2.5" : "" });

/** Sends the open bill to the student again (they say it never came). An email, so it waits a moment and can be taken back. */
export function AdminResendBillButton({ planId, compact = false }: { planId: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  async function resend() {
    setBusy(true);
    try {
      const hold = await toast.held("Resending the bill", () => resendBillAction(planId), { mail: true });
      if (hold.undone) return;
      const result = hold.value;
      if (result.ok) toast.success(result.message);
      else toast.warning(result.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" disabled={busy} onClick={() => void resend()} className={menuButton(compact)}>
      {busy ? <MorphingSquare size={12} className="mr-1.5 shrink-0" /> : <Send aria-hidden className="mr-1.5 h-3.5 w-3.5" />}
      Resend bill
    </button>
  );
}

/** Owner: money for this plan that arrived another way. Approves the bill that is open, or records the next one as paid. */
export function AdminRecordPaymentButton({ planId, amountCents, firstPayment, openBill, compact = false }: { planId: string; amountCents: number; firstPayment: boolean; /** A bill is open now (sent or not). */ openBill: boolean; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fix, setFix] = useState<PlanFix | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey());
  const [notify, setNotify] = useNotifyStudent("student-changes");

  async function record() {
    setBusy(true);
    setError(null);
    setFix(null);
    try {
      const hold = await toast.held("Recording the payment", () => recordPlanPaymentAction(planId, notify, key), { mail: notify });
      if (hold.undone) return;
      const result = hold.value;
      if (!result.ok) {
        setError(result.error ?? "Could not record the payment.");
        setFix(result.fix ?? null);
        return;
      }
      toast.success("Payment recorded");
      setKey(newIdempotencyKey());
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => { setError(null); setFix(null); setOpen(true); }} aria-haspopup="dialog" className={menuButton(compact)}>
        <Coins aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Record payment
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title="Record payment">
        <NotifyToggle on={notify} onChange={setNotify} className="mb-3" />
        <div className="space-y-3">
          <p className="text-small text-slate-300">
            Record {usd(amountCents)} as received{openBill ? " for the bill that is open now" : " for their next bill"}. It counts in revenue
            {firstPayment ? ", opens their access, adds their credits and books their weekly time" : ", adds this cycle's credits and moves the next bill 28 days on"}.
          </p>
          {error && <p role="alert" className="text-small text-red-400">{error}</p>}
          {fix && <PlanFixPanel fix={fix} notify={notify} onDone={() => { setFix(null); setError(null); setOpen(false); }} />}
          {!fix && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => setOpen(false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Never mind
              </button>
              <button type="button" disabled={busy} onClick={() => void record()} className={buttonVariants({ variant: "primary", size: "sm" })}>
                {busy && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                Yes, {usd(amountCents)} arrived
              </button>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

/** Ends the plan (the same action as Billing > Plans' Cancel plan), with the reason kept on the plan. */
export function AdminCancelPlanButton({ planId, label, compact = false }: { planId: string; label: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notify, setNotify] = useNotifyStudent("student-changes");

  async function cancel() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      const hold = await toast.held("Canceling the plan", () => cancelPaymentPlanAction(planId, note.trim(), notify), { mail: notify });
      if (hold.undone) return;
      toast.success("Plan canceled");
      setOpen(false);
      setNote("");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't cancel the plan", { description: err instanceof Error && err.message ? err.message : "Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={buttonVariants({ variant: "ghost", size: "sm", className: cn("text-red-300 hover:text-red-200", compact ? "h-8 px-2.5" : "") })}>
        <Ban aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Cancel plan
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title="Cancel plan">
        <NotifyToggle on={notify} onChange={setNotify} className="mb-3" />
        <div className="space-y-3">
          <p className="text-small text-slate-300">
            End the {label} plan now. Its unpaid bill closes and its weekly time is freed. Money already paid is not touched.
          </p>
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this plan being canceled?"
            rows={2}
            className="w-full resize-none rounded-control border border-(--field-edge) bg-neu-base px-3 py-2 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Keep the plan
            </button>
            <button type="button" disabled={busy || !note.trim()} onClick={() => void cancel()} className={buttonVariants({ variant: "danger", size: "sm" })}>
              {busy && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
              Confirm cancel
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/**
 * Owner: a late payer in one step (src/lib/lateSettlement.ts). Shows what it will do first (the bill, the classes taught before they
 * paid, the new due date 28 days from today), then does it all on the second tap.
 */
export function AdminSettleLateButton({ planId, compact = false }: { planId: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<LateSettlementPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fix, setFix] = useState<PlanFix | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [chargeUnbooked, setChargeUnbooked] = useState(false);
  const [recordPayment, setRecordPayment] = useState(true);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => newIdempotencyKey());
  const [notify, setNotify] = useNotifyStudent("student-changes");

  async function load() {
    setPreview(null);
    setError(null);
    setFix(null);
    setSure(false);
    const result = await lateSettlementPreviewAction(planId).catch(() => ({ ok: false as const, error: "Could not load the plan.", fix: null }));
    if (!result.ok) {
      setError(result.error);
      setFix(result.fix ?? null);
      return;
    }
    setPreview(result.preview);
    setPicked(result.preview.taught.map((t) => t.id));
    setChargeUnbooked(false);
    setRecordPayment(result.preview.payment !== "done");
  }

  async function settle() {
    if (!preview) return;
    setBusy(true);
    try {
      const hold = await toast.held(
        "Settling the late payment",
        () => settleLatePaymentAction(planId, { recordPayment, bookingIds: picked, chargeUnbookedClass: chargeUnbooked }, key, notify),
        { mail: notify },
      );
      if (hold.undone) return;
      const result = hold.value;
      if (!result.ok) {
        setSure(false);
        setError(result.error ?? "Could not settle it.");
        setFix(result.fix ?? null);
        return;
      }
      toast.success("Settled", { description: result.newDueDate ? `Next bill ${dayLabel(result.newDueDate)}` : undefined });
      setKey(newIdempotencyKey());
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); void load(); }} aria-haspopup="dialog" className={menuButton(compact)}>
        <Hourglass aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Settle late payment
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title="Settle late payment">
        <NotifyToggle on={notify} onChange={setNotify} className="mb-3" />
        {error && <p role="alert" className="mb-3 text-small text-red-400">{error}</p>}
        {fix && <PlanFixPanel fix={fix} notify={notify} onDone={() => void load()} />}
        {!preview && !error && (
          <p className="inline-flex items-center gap-2 text-small text-slate-400">
            <MorphingSquare size={12} />
            Loading the plan
          </p>
        )}
        {preview && (
          <div className="space-y-4">
            <p className="text-small text-slate-300">
              For <span className="font-medium text-slate-50">{preview.studentName}</span>, who paid after their bill was due ({dayLabel(preview.currentDueDate)}).
            </p>
            <label className="flex items-center gap-2 text-small text-slate-200">
              <input type="checkbox" checked={recordPayment} onChange={(e) => setRecordPayment(e.target.checked)} className="h-4 w-4 accent-signal" />
              {preview.payment === "open" ? `Mark the open bill paid (${usd(preview.amountCents)})` : preview.payment === "new" ? `Record ${usd(preview.amountCents)} as received` : "A payment was already approved today"}
            </label>
            <div className="space-y-1.5">
              <p className="text-small font-medium text-slate-200">
                Classes taught before they paid
              </p>
              <p className="text-caption text-slate-500">Ticked classes are marked present, which spends their credit.</p>
              {preview.taught.length === 0 && <p className="text-small text-slate-500">None booked and unmarked.</p>}
              {preview.taught.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-small text-slate-300">
                  <input
                    type="checkbox"
                    checked={picked.includes(t.id)}
                    onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id)))}
                    className="h-4 w-4 accent-signal"
                  />
                  {formatEtShort(t.scheduledAt, { weekday: true })}
                </label>
              ))}
              <label className="flex items-center gap-2 text-small text-slate-300">
                <input type="checkbox" checked={chargeUnbooked} onChange={(e) => setChargeUnbooked(e.target.checked)} className="h-4 w-4 accent-signal" />
                Charge one class that was never booked
              </label>
            </div>
            <p className="text-small text-slate-300">
              Next bill moves to <span className="font-medium text-slate-50">{dayLabel(preview.newDueDate)}</span>, 28 days from today, and this cycle&apos;s credits last until then.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => setOpen(false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Never mind
              </button>
              <button type="button" disabled={busy} onClick={() => (sure ? void settle() : setSure(true))} className={buttonVariants({ variant: "primary", size: "sm" })}>
                {busy && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                {sure ? "Yes, settle it" : "Settle"}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
