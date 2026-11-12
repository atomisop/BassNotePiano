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
import { clearAccountDiscountAction, setAccountDiscountAction } from "@/app/(dashboard)/admin/pricing/actions";
import { PlanFixPanel } from "@/components/admin/PlanFixPanel";
import type { PlanFix } from "@/lib/planFixes";
import { MAX_PERSONAL_DISCOUNT_PERCENT } from "@/lib/classCreditPricing";

const TERMS: { term: PaymentPlanTerm; label: string; bills: number }[] = [
  { term: "MONTHLY", label: "1 Month", bills: 1 },
  { term: "TERM_3", label: "3 Months", bills: 3 },
  { term: "TERM_6", label: "6 Months", bills: 6 },
];
const field = "h-11 w-full rounded-control border border-(--field-edge) bg-neu-base px-4 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring";
const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
type Result = { ok: true; message: string } | { ok: false; error: string; fix?: PlanFix | null };

function useRun(onDone: () => void) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  // A refusal the owner can fix right here (a payment waiting, a running plan in the way, a first payment to record) shows its fix.
  const [refusal, setRefusal] = useState<{ error: string; fix: PlanFix } | null>(null);
  async function run(key: string, work: () => Promise<Result>) {
    setBusy(key);
    setRefusal(null);
    const label = { length: "Changing the plan length", price: "Changing the price", waive: "Giving 28 days free", restart: "Restarting the plan", discount: "Changing the discount" }[key] ?? "Saving";
    const hold = await toast.held(label, () => work().catch((): Result => ({ ok: false, error: "Something went wrong. Try again." })), { mail: true });
    setBusy(null);
    if (hold.undone) return;
    const result = hold.value;
    if (!result.ok) {
      if (result.fix) setRefusal({ error: result.error, fix: result.fix });
      return void toast.warning(result.error);
    }
    toast.success(result.message);
    onDone();
    router.refresh();
  }
  return { busy, run, refusal, clearRefusal: () => setRefusal(null) };
}

/**
 * Owner only, next to Bill date on the student page: one box for the plan's length, its exact price per bill, and giving the next
 * 28 days free. Works for one person's plan on a group or parent plan too.
 */
export function AdminPlanSettingsButton(props: {
  planId: string;
  term: PaymentPlanTerm;
  priceCents: number;
  installmentsPaid: number;
  hasDiscount: boolean;
  /** The account's personal discount, set right here (the same rules as Billing > Pricing). */
  userId?: string;
  discountPercent?: number;
  discountNote?: string | null;
  /** A group or parent plan keeps the group rate: a personal discount does not change it. */
  groupPlan?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState(props.term);
  const [newPrice, setNewPrice] = useState(false);
  const [dollars, setDollars] = useState((props.priceCents / 100).toFixed(2));
  const [sureWaive, setSureWaive] = useState(false);
  const [percent, setPercent] = useState(String(props.discountPercent || ""));
  const [sureRemove, setSureRemove] = useState(false);
  const [notify, setNotify] = useNotifyStudent("student-changes");
  const { busy, run, refusal, clearRefusal } = useRun(() => setOpen(false));
  const price = Math.round(Number(dollars) * 100);
  const currentPercent = props.discountPercent ?? 0;
  const percentNum = Number(percent);
  const percentValid = Number.isInteger(percentNum) && percentNum >= 1 && percentNum <= MAX_PERSONAL_DISCOUNT_PERCENT;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTerm(props.term);
          setNewPrice(false);
          setDollars((props.priceCents / 100).toFixed(2));
          setSureWaive(false);
          setPercent(String(props.discountPercent || ""));
          setSureRemove(false);
          clearRefusal();
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className={buttonVariants({ variant: "ghost", size: "sm", className: props.compact ? "h-8 px-2.5" : "" })}
      >
        <Settings aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Length, price, discount
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title="Plan settings">
        <NotifyToggle on={notify} onChange={setNotify} className="mb-3" />
        {refusal && (
          <div className="mb-4 space-y-2">
            <p role="alert" className="text-small text-red-400">{refusal.error}</p>
            <PlanFixPanel fix={refusal.fix} notify={notify} onDone={clearRefusal} />
          </div>
        )}
        <div className="grid gap-5">
          <section className="grid gap-2">
            <h3 className="text-body font-semibold text-slate-50">Length</h3>
            <p className="text-small text-slate-400">{props.installmentsPaid} {props.installmentsPaid === 1 ? "bill" : "bills"} paid so far. A length has to be longer than that.</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Plan length">
              {TERMS.map((t) => (
                <button
                  key={t.term}
                  type="button"
                  role="radio"
                  aria-checked={term === t.term}
                  disabled={t.bills <= props.installmentsPaid && t.term !== props.term}
                  onClick={() => setTerm(t.term)}
                  className={buttonVariants({ variant: term === t.term ? "secondary" : "ghost", size: "sm", className: term === t.term ? "text-signal-fg hover:text-signal-fg" : "" })}
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

          {props.userId && (
            <section className="grid gap-2 border-t border-slate-50/10 pt-4">
              <h3 className="text-body font-semibold text-slate-50">
                Personal discount
              </h3>
              <p className="text-small text-slate-400">
                {props.groupPlan
                  ? "A percent off this account's own plans. This plan is part of a group, which keeps the group rate, so it changes their next solo plan only."
                  : "A percent off this account's plan. The running plan and an unpaid bill change now, and they are told. Bills already paid never change."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2">
                  <span className="sr-only">Percent off</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_PERSONAL_DISCOUNT_PERCENT}
                    value={percent}
                    onChange={(e) => {
                      setPercent(e.target.value);
                      setSureRemove(false);
                    }}
                    placeholder="0"
                    className={`${field} w-24`}
                  />
                  <span className="text-small text-slate-400">% off</span>
                </label>
                <button
                  type="button"
                  disabled={!!busy || !percentValid || percentNum === currentPercent || !props.userId}
                  onClick={() => props.userId && void run("discount", () => setAccountDiscountAction(props.userId!, percentNum, props.discountNote ?? "", notify))}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  {busy === "discount" && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                  {currentPercent > 0 ? "Change discount" : "Give discount"}
                </button>
                {currentPercent > 0 && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => (sureRemove ? props.userId && void run("discount", () => clearAccountDiscountAction(props.userId!, notify)) : setSureRemove(true))}
                    className={buttonVariants({ variant: sureRemove ? "danger" : "ghost", size: "sm", className: sureRemove ? "" : "text-red-300 hover:text-red-200" })}
                  >
                    {sureRemove ? `Yes, remove ${currentPercent}% off` : "Remove"}
                  </button>
                )}
              </div>
            </section>
          )}

          <section className="grid gap-2 border-t border-slate-50/10 pt-4">
            <h3 className="text-body font-semibold text-slate-50">Price per bill</h3>
            {props.hasDiscount ? (
              <p className="text-small text-slate-400">The personal discount above sets the price. Remove it to set an exact price.</p>
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
            {props.installmentsPaid < 1 && (
              // The first payment has to be on record before a later bill can be waived: record it right here.
              <PlanFixPanel fix={{ kind: "record-payment", planId: props.planId }} notify={notify} onDone={() => setOpen(false)} />
            )}
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
  const { busy, run, refusal, clearRefusal } = useRun(() => setSure(false));
  return (
    <>
      <button
        type="button"
        disabled={!!busy}
        onClick={() => (sure ? void run("restart", () => restartPlanAction(planId, notify)) : setSure(true))}
        className={buttonVariants({ variant: sure ? "primary" : "ghost", size: "sm", className: compact ? "h-8 px-2.5" : "" })}
      >
        {busy ? <MorphingSquare size={12} className="mr-1.5 shrink-0" /> : <RotateCcw aria-hidden className="mr-1.5 h-3.5 w-3.5" />}
        {sure ? `Restart the ${label} plan?` : "Restart canceled plan"}
      </button>
      {/* Refused because another plan is running: cancel that one right here, then restart. */}
      <Dialog open={!!refusal} onOpenChange={(next) => !next && clearRefusal()} title="Restart canceled plan">
        {refusal && (
          <div className="space-y-3">
            <p role="alert" className="text-small text-red-400">{refusal.error}</p>
            <PlanFixPanel fix={refusal.fix} notify={notify} onDone={clearRefusal} />
          </div>
        )}
      </Dialog>
    </>
  );
}
