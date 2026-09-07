"use client";

import { useState } from "react";
import type { PaymentPlanCadence, PaymentPlanTerm, ZellePaymentStatus } from "@prisma/client";
import { calculatePaymentPlanRate, describePaymentPlan } from "@/lib/classCreditPricing";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { enrollInPaymentPlanAction, submitPlanInstallmentPaymentAction } from "./actions";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const CADENCE_OPTIONS: { value: PaymentPlanCadence; label: string }[] = [
  { value: "MIN_30_WEEKLY", label: "30 min/week" },
  { value: "MIN_60_WEEKLY", label: "60 min/week" },
];

const TERM_OPTIONS: { value: PaymentPlanTerm; label: string; discountPercent: number }[] = [
  { value: "MONTHLY", label: "Monthly", discountPercent: 0 },
  { value: "TERM_3", label: "3-Month", discountPercent: 10 },
  { value: "TERM_6", label: "6-Month", discountPercent: 20 },
  { value: "TERM_12", label: "Yearly", discountPercent: 30 },
];

export interface ActivePlanSummary {
  id: string;
  cadence: PaymentPlanCadence;
  term: PaymentPlanTerm;
  installmentsPaid: number;
  termMonths: number;
}

export interface OpenInstallmentSummary {
  id: string;
  status: ZellePaymentStatus;
  rejectionReason: string | null;
  amountCents: number;
  installmentNumber: number | null;
}

interface PaymentPlanEnrollmentFlowProps {
  zelleHandle: string;
  activePlan: ActivePlanSummary | null;
  openInstallment: OpenInstallmentSummary | null;
  /** Preselects the picker from a specific marketing-page tile (PaymentPlanTierGrid's ?cadence=&term= links) instead of always defaulting. */
  initialCadence?: PaymentPlanCadence;
  initialTerm?: PaymentPlanTerm;
}

/**
 * Handles both states of /billing/plans: no active plan (the cadence/term
 * picker below) and an active plan with something to pay (progress +
 * ZelleUnlockGate) — same "one component switches on local state, not two
 * separate pages" shape the old a-la-carte credit purchase flow used to use.
 */
export function PaymentPlanEnrollmentFlow({
  zelleHandle,
  activePlan: initialPlan,
  openInstallment: initialInstallment,
  initialCadence,
  initialTerm,
}: PaymentPlanEnrollmentFlowProps) {
  const [cadence, setCadence] = useState<PaymentPlanCadence>(initialCadence ?? "MIN_30_WEEKLY");
  const [term, setTerm] = useState<PaymentPlanTerm>(initialTerm ?? "TERM_6");
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState<{ plan: ActivePlanSummary; installment: OpenInstallmentSummary } | null>(
    initialPlan && initialInstallment ? { plan: initialPlan, installment: initialInstallment } : null,
  );

  const rate = calculatePaymentPlanRate(cadence, term);

  async function handleEnroll() {
    setLoading(true);
    setError(null);
    const result = await enrollInPaymentPlanAction(cadence, term);
    setLoading(false);
    if (!result.ok || !result.planId || !result.installmentPaymentId || result.amountCents === null) {
      setError(result.error ?? "Something went wrong starting your plan.");
      return;
    }
    setEnrolled({
      plan: { id: result.planId, cadence, term, installmentsPaid: 0, termMonths: rate.termMonths },
      installment: {
        id: result.installmentPaymentId,
        status: "AWAITING_TRANSFER",
        rejectionReason: null,
        amountCents: result.amountCents,
        installmentNumber: 1,
      },
    });
  }

  if (enrolled) {
    const { plan, installment } = enrolled;
    const planLabel = describePaymentPlan(plan.cadence, plan.term);
    const progressPercent = Math.min(100, (plan.installmentsPaid / plan.termMonths) * 100);

    return (
      <div>
        <div className="mb-4 rounded-xl border border-ink/10 p-4">
          <p className="text-sm text-slate-100">{planLabel}</p>
          <p className="mt-1 text-xs text-slate-500">
            {plan.installmentsPaid} of {plan.termMonths} installments paid
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-[rgb(var(--c-s-50))]" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        <ZelleUnlockGate
          status={installment.status}
          rejectionReason={installment.rejectionReason}
          scaleCode={`Installment ${installment.installmentNumber ?? plan.installmentsPaid + 1} of ${plan.termMonths}`}
          scaleTitle={planLabel}
          eyebrowLabel="Payment Plan"
          amountCents={installment.amountCents}
          zelleHandle={zelleHandle}
          onSubmitPayment={submitPlanInstallmentPaymentAction.bind(null, installment.id)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-medium text-slate-400">Weekly cadence</p>
        <div className="grid grid-cols-2 gap-3">
          {CADENCE_OPTIONS.map((option) => {
            const active = cadence === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setCadence(option.value)}
                className={`rounded-lg border px-3.5 py-3 text-left transition ${
                  active ? "border-[rgb(var(--c-s-50)/0.6)] bg-[rgb(var(--c-s-50)/0.1)]" : "border-ink/10 hover:border-ink/15"
                }`}
              >
                <p className={`text-sm font-medium ${active ? "text-[rgb(var(--c-s-50))]" : "text-slate-100"}`}>{option.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {calculatePaymentPlanRate(option.value, term).creditsPerInstallment} credits/month
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-slate-400">Term</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TERM_OPTIONS.map((option) => {
            const active = term === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTerm(option.value)}
                className={`rounded-lg border px-3 py-3 text-center transition ${
                  active ? "border-[rgb(var(--c-s-50)/0.6)] bg-[rgb(var(--c-s-50)/0.1)]" : "border-ink/10 hover:border-ink/15"
                }`}
              >
                <p className={`text-sm font-medium ${active ? "text-[rgb(var(--c-s-50))]" : "text-slate-100"}`}>{option.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {option.discountPercent > 0 ? `−${option.discountPercent}%` : "No commitment"}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-ink/10 p-4 sm:p-5">
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            {rate.termMonths === 1
              ? `${formatUsd(rate.installmentAmountCents)}, one month`
              : `${formatUsd(rate.installmentAmountCents)}/month × ${rate.termMonths} months`}
          </span>
          <span>{formatUsd(rate.totalCommittedCents)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-ink/10 pt-2 text-base font-semibold text-slate-50">
          <span>{rate.termMonths === 1 ? "Due now" : "Due each month"}</span>
          <span>{formatUsd(rate.installmentAmountCents)}</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {rate.termMonths === 1
            ? "One Zelle payment for one month of credits — no term, re-enroll any time."
            : "Billed one installment at a time via Zelle, never all at once — we’ll email you an invoice as each one comes due."}
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[rgb(var(--c-s-50)/0.2)] bg-[rgb(var(--c-s-50)/0.05)] p-3.5 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink/10 bg-slate-950 accent-[rgb(var(--c-s-50))]"
        />
        <span>
          {rate.termMonths === 1
            ? `I'm paying for one month of credits (${formatUsd(rate.installmentAmountCents)}), no further commitment.`
            : `I'm committing to ${rate.termMonths} monthly installments of ${formatUsd(rate.installmentAmountCents)} each.`}{" "}
          Enrolling doesn&apos;t reserve a recurring class time — booking stays the same self-serve system it always is.
          Money spent is <span className="font-medium text-[rgb(var(--c-s-50))]">non-refundable</span> once a credit is
          used, same as any class credit purchase.
        </span>
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleEnroll}
        disabled={loading || !acknowledged}
        className="cta-sheen cta-fill flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <MorphingSquare size={14} className="mr-2 shrink-0" />}
        {loading ? "Starting…" : "Start plan"}
      </button>
    </div>
  );
}
