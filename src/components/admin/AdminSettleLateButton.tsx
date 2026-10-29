"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, HandCoins } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Hint } from "@/components/ui/Hint";
import { toast } from "@/components/ui/Toaster";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import { formatEtShort } from "@/lib/classScheduleLabels";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";
import { lateSettlementPreviewAction, settleLatePaymentAction } from "@/app/(dashboard)/admin/payment-plans/actions";
import type { LateSettlementPreview } from "@/lib/lateSettlement";

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const day = (iso: string) => formatEtShort(iso, { weekday: false }).replace(/, \d+:\d+ [AP]M$/, "");

/**
 * Settles a late payer in one step (owner only): marks the payment received, charges the class they were taught before paying, and
 * puts the next bill 28 days from today. It shows exactly what will happen before anything changes.
 */
export function AdminSettleLateButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<LateSettlementPreview | null>(null);
  const [recordPayment, setRecordPayment] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [chargeUnbooked, setChargeUnbooked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => newIdempotencyKey());

  async function openBox() {
    setOpen(true);
    setPreview(null);
    const result = await lateSettlementPreviewAction(planId).catch(() => ({ ok: false as const, error: "Could not load." }));
    if (!result.ok) {
      toast.warning(result.error);
      setOpen(false);
      return;
    }
    setPreview(result.preview);
    setRecordPayment(result.preview.payment !== "done");
    setPicked(result.preview.taught[0] ? [result.preview.taught[0].id] : []);
    setChargeUnbooked(result.preview.taught.length === 0);
  }

  const charged = preview ? preview.taught.filter((t) => picked.includes(t.id)).reduce((n, t) => n + t.creditsSpent, 0) + (chargeUnbooked ? 2 : 0) : 0;
  const gained = preview && recordPayment ? preview.creditsPerPayment : 0;

  async function settle() {
    if (!preview) return;
    setBusy(true);
    const result = await settleLatePaymentAction(planId, { recordPayment, bookingIds: picked, chargeUnbookedClass: chargeUnbooked }, key).catch((): { ok: boolean; error: string | null; newDueDate?: string } => ({ ok: false, error: "Something went wrong. Check the plan before trying again." }));
    setBusy(false);
    if (!result.ok) return toast.warning(result.error ?? "Could not settle.");
    toast.success("Settled. Next bill " + day(result.newDueDate ?? preview.newDueDate));
    setKey(newIdempotencyKey());
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => void openBox()} aria-haspopup="dialog" className={buttonVariants({ variant: "secondary", size: "sm", className: "h-8 px-2.5" })}>
        <HandCoins aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Late payment
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => !busy && setOpen(next)}
        title={preview ? `Settle ${preview.studentName}` : "Settle a late payment"}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Never mind
            </Button>
            <Button type="button" disabled={!preview || busy || (!recordPayment && picked.length === 0 && !chargeUnbooked)} loading={busy} onClick={settle}>
              Settle
            </Button>
          </div>
        }
      >
        {!preview ? (
          <p className="text-small text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-1 text-small text-slate-400">
              One step instead of three
              <Hint label="What this does">Marks the payment received, charges the class they were taught before paying, and puts the next bill 28 days from today. Nothing changes until you press Settle.</Hint>
            </div>

            <label className="flex items-start gap-3 rounded-xl bg-neu-base p-3 shadow-raised-low">
              <input type="checkbox" checked={recordPayment} onChange={(e) => setRecordPayment(e.target.checked)} className="mt-1 h-4 w-4 accent-[rgb(var(--signal))]" />
              <span className="min-w-0">
                <span className="block text-small font-semibold text-slate-50">{preview.payment === "done" ? "Payment already recorded today" : `Payment received · ${usd(preview.amountCents)}`}</span>
                <span className="block text-small text-slate-500">
                  {recordPayment ? `Marks it paid and gives ${creditsLabelFromStored(preview.creditsPerPayment)}.` : "Leaves the payment as it is."}
                </span>
              </span>
            </label>

            <div className="rounded-xl bg-neu-base p-3 shadow-raised-low">
              <p className="text-small font-semibold text-slate-50">Class taught before paying</p>
              {preview.taught.length === 0 ? (
                <label className="mt-1.5 flex items-center gap-2 text-small text-slate-300">
                  <input type="checkbox" checked={chargeUnbooked} onChange={(e) => setChargeUnbooked(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--signal))]" />
                  Charge one class (no booking exists for it)
                </label>
              ) : (
                <div className="mt-1.5 space-y-1.5">
                  {preview.taught.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-small text-slate-200">
                      <input
                        type="checkbox"
                        checked={picked.includes(t.id)}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, t.id] : p.filter((x) => x !== t.id)))}
                        className="h-4 w-4 accent-[rgb(var(--signal))]"
                      />
                      {formatEtShort(t.scheduledAt)} · {creditsLabelFromStored(t.creditsSpent)}
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-small text-slate-400">
                    <input type="checkbox" checked={chargeUnbooked} onChange={(e) => setChargeUnbooked(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--signal))]" />
                    Also charge one class with no booking
                  </label>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-neu-base p-3 shadow-pressed-low">
              <p className="flex items-center gap-1.5 text-small font-semibold text-slate-50">
                <CalendarCheck aria-hidden className="h-4 w-4 text-[rgb(var(--c-s-50))]" />
                Next bill {day(preview.newDueDate)}
                <span className="font-normal text-slate-500">(was {day(preview.currentDueDate)})</span>
              </p>
              <p className="mt-1 text-small text-slate-400">
                Credits: {gained > 0 ? `+${creditsLabelFromStored(gained)}` : "no new credits"}
                {charged > 0 ? `, ${creditsLabelFromStored(charged)} used for the class taught` : ""}. They last until the new date.
              </p>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
