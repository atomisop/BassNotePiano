"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PaymentPlanTerm } from "@prisma/client";
import { RotateCcw, Settings } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { restartPlanAction, setPlanLengthAction, setPlanPriceAction, waiveNextBillAction } from "@/app/(dashboard)/admin/payment-plans/actions";

const TERMS: { term: PaymentPlanTerm; label: string; bills: number }[] = [
  { term: "MONTHLY", label: "1 Month", bills: 1 },
  { term: "TERM_3", label: "3 Months", bills: 3 },
  { term: "TERM_6", label: "6 Months", bills: 6 },
];
const field = "h-11 w-full rounded-control border border-(--field-edge) bg-neu-base px-4 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring";
const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
type Result = { ok: true; message: string } | { ok: false; error: string };

function useRun(onDone: () => void) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, work: () => Promise<Result>) {
    setBusy(key);
    const result = await work().catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setBusy(null);
    if (!result.ok) return void toast.warning(result.error);
    toast.success(result.message);
    onDone();
    router.refresh();
  }
  return { busy, run };
}

/**
 * Owner only, next to Bill date on the student page: one box for the plan's length, its exact price per bill, and giving the next
 * 28 days free. Works for one person's plan on a group or parent plan too.
 */
export function AdminPlanSettingsButton(props: { planId: string; term: PaymentPlanTerm; priceCents: number; installmentsPaid: number; hasDiscount: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState(props.term);
  const [newPrice, setNewPrice] = useState(false);
  const [dollars, setDollars] = useState((props.priceCents / 100).toFixed(2));
  const [sureWaive, setSureWaive] = useState(false);
  const [notify, setNotify] = useNotifyStudent("student-changes");
  const { busy, run } = useRun(() => setOpen(false));
  const price = Math.round(Number(dollars) * 100);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTerm(props.term);
          setNewPrice(false);
          setDollars((props.priceCents / 100).toFixed(2));
          setSureWaive(false);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className={buttonVariants({ variant: "secondary", size: "sm", className: props.compact ? "h-8 px-2.5" : "" })}
      >
        <Settings aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Plan settings
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title="Plan settings">
        <NotifyToggle on={notify} onChange={setNotify} className="mb-3" />
        <div className="grid gap-5">
          <section className="grid gap-2">
            <h3 className="text-body font-semibold text-slate-50">Length</h3>
            <p className="text-small text-slate-400">{props.installmentsPaid} bills paid so far. A length has to be longer than that.</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Plan length">
              {TERMS.map((t) => (
                <button
                  key={t.term}
                  type="button"
                  role="radio"
                  aria-checked={term === t.term}
                  disabled={t.bills <= props.installmentsPaid && t.term !== props.term}
                  onClick={() => setTerm(t.term)}
                  className={buttonVariants({ variant: term === t.term ? "primary" : "secondary", size: "sm" })}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-small text-slate-300">
              <input type="checkbox" checked={newPrice} onChange={(e) => setNewPrice(e.target.checked)} className="h-4 w-4 accent-signal" />
              Use that length&apos;s own price (otherwise each bill stays {usd(props.priceCents)})
            </label>
            <button
              type="button"
              disabled={!!busy || term === props.term}
              onClick={() => void run("length", () => setPlanLengthAction(props.planId, term, newPrice, notify))}
              className={buttonVariants({ variant: "secondary", size: "sm", className: "justify-self-start" })}
            >
              {busy === "length" && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
              Save length
            </button>
          </section>

          <section className="grid gap-2 border-t border-slate-50/10 pt-4">
            <h3 className="text-body font-semibold text-slate-50">Price per bill</h3>
            {props.hasDiscount ? (
              <p className="text-small text-slate-400">This account has a personal discount, which sets the price. Change it on Billing &gt; Pricing.</p>
            ) : (
              <>
                <p className="text-small text-slate-400">Every bill from the next one on. An unpaid bill already sent is replaced at the new price.</p>
                <label className="grid max-w-48 gap-1.5">
                  <span className="sr-only">Price in dollars</span>
                  <input inputMode="decimal" value={dollars} onChange={(e) => setDollars(e.target.value.replace(/[^\d.]/g, ""))} className={field} />
                </label>
                <button
                  type="button"
                  disabled={!!busy || !price || price === props.priceCents}
                  onClick={() => void run("price", () => setPlanPriceAction(props.planId, price / 100, notify))}
                  className={buttonVariants({ variant: "secondary", size: "sm", className: "justify-self-start" })}
                >
                  {busy === "price" && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                  {price && price !== props.priceCents ? `Set to ${usd(price)}` : "Save price"}
                </button>
              </>
            )}
          </section>

          <section className="grid gap-2 border-t border-slate-50/10 pt-4">
            <h3 className="text-body font-semibold text-slate-50">Next 28 days free</h3>
            <p className="text-small text-slate-400">Counts as a paid bill: their classes and credits for the cycle are added and the next bill moves 28 days out. Recorded as a $0 payment.</p>
            <button
              type="button"
              disabled={!!busy || props.installmentsPaid < 1}
              onClick={() => (sureWaive ? void run("waive", () => waiveNextBillAction(props.planId, notify)) : setSureWaive(true))}
              className={buttonVariants({ variant: sureWaive ? "primary" : "secondary", size: "sm", className: "justify-self-start" })}
            >
              {busy === "waive" && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
              {sureWaive ? `Yes, waive ${usd(props.priceCents)}` : "Give 28 days free"}
            </button>
          </section>
        </div>
      </Dialog>
    </>
  );
}

/** Owner only, on the student page when their last plan was canceled: brings it back with the bills already paid. */
export function AdminRestartPlanButton({ planId, label, compact = false }: { planId: string; label: string; compact?: boolean }) {
  const [sure, setSure] = useState(false);
  const [notify] = useNotifyStudent("student-changes");
  const { busy, run } = useRun(() => setSure(false));
  return (
    <button
      type="button"
      disabled={!!busy}
      onClick={() => (sure ? void run("restart", () => restartPlanAction(planId, notify)) : setSure(true))}
      className={buttonVariants({ variant: sure ? "primary" : "secondary", size: "sm", className: compact ? "h-8 px-2.5" : "" })}
    >
      {busy ? <MorphingSquare size={12} className="mr-1.5 shrink-0" /> : <RotateCcw aria-hidden className="mr-1.5 h-3.5 w-3.5" />}
      {sure ? `Restart the ${label} plan?` : "Restart canceled plan"}
    </button>
  );
}
