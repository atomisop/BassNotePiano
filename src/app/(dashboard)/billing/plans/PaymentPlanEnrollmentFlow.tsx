"use client";

import { useEffect, useMemo, useState } from "react";
import type { PaymentPlanCadence, PaymentPlanTerm, ZellePaymentStatus } from "@prisma/client";
import { calculatePaymentPlanRate, describePaymentPlan, PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";
import type { ReservableSlot } from "@/lib/classSchedule";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { enrollInPaymentPlanAction, getReservableSlotsAction, submitPlanInstallmentPaymentAction } from "./actions";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "14:00" -> "2:00 PM" — matches AdminScheduleManager.tsx's own formatTimeLabel, kept as its own small copy rather than a shared import across the admin/student boundary (same "duplicated on purpose" convention this codebase already uses for e.g. requireAdmin()). */
function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
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
  /** ISO date string. Set only when activePlan exists but openInstallment doesn't yet: the next installment isn't payable until it's within INSTALLMENT_OPEN_LEAD_DAYS of this date (see getOrCreateOpenInstallmentPayment). Renders as a "your next installment opens on X" state instead of a payable invoice. */
  nextInstallmentDueDate?: string;
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
  nextInstallmentDueDate,
  initialCadence,
  initialTerm,
}: PaymentPlanEnrollmentFlowProps) {
  const [cadence, setCadence] = useState<PaymentPlanCadence>(initialCadence ?? "MIN_30_WEEKLY");
  const [term, setTerm] = useState<PaymentPlanTerm>(initialTerm ?? "TERM_6");
  const [slots, setSlots] = useState<ReservableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<ReservableSlot | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // installment is nullable now: an active plan can have nothing payable yet
  // (see nextInstallmentDueDate above), that's still "enrolled", just
  // between installments, not the picker below.
  const [enrolled, setEnrolled] = useState<{ plan: ActivePlanSummary; installment: OpenInstallmentSummary | null } | null>(
    initialPlan ? { plan: initialPlan, installment: initialInstallment } : null,
  );

  const rate = calculatePaymentPlanRate(cadence, term);
  // Credits are internal bookkeeping now, by direct instruction: a student
  // never sees a raw credit count, just how many classes a month and how
  // long each one is. Both cadences work out to the same 4 classes a
  // month, they only differ in length, dividing creditsPerInstallment by
  // the cadence's own weekly cost (rather than hardcoding 4) keeps this
  // correct if the pricing table above it ever changes.
  const classesPerMonth = rate.creditsPerInstallment / PLAN_CADENCE_CREDITS_PER_WEEK[cadence];
  const classMinutes = cadence === "MIN_60_WEEKLY" ? 60 : 30;
  const termPhrase = rate.termMonths === 1 ? "this month" : `your whole ${rate.termMonths}-month term`;

  // Grouped by day, not one flat list: the same weekday can legitimately
  // offer more than one start time (a longer admin-defined window split
  // into several bookable chunks), which used to render as the day name
  // repeated back to back for each time, reading as a bug ("the days
  // double up") rather than what it actually is, more than one option on
  // that day.
  const slotsByDay = useMemo(() => {
    const groups = new Map<number, ReservableSlot[]>();
    for (const slot of slots) {
      const forDay = groups.get(slot.dayOfWeek) ?? [];
      forDay.push(slot);
      groups.set(slot.dayOfWeek, forDay);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b);
  }, [slots]);

  // Re-fetched whenever cadence changes (not term — a slot's room only
  // depends on the weekly credit cost, which is cadence-only, see
  // PLAN_CADENCE_CREDITS_PER_WEEK). Selection is cleared on change rather
  // than silently carried over, since the previous pick might not even be
  // in the new list.
  useEffect(() => {
    let cancelled = false;
    setSlotsLoading(true);
    setSelectedSlot(null);
    getReservableSlotsAction(cadence).then((result) => {
      if (!cancelled) {
        setSlots(result);
        setSlotsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cadence]);

  async function handleEnroll() {
    if (!selectedSlot) return;
    setLoading(true);
    setError(null);
    const result = await enrollInPaymentPlanAction(cadence, term, selectedSlot.scheduleId, selectedSlot.chunkIndex);
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
        {installment ? (
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
        ) : (
          // Between installments, on purpose: one Zelle payment a month is
          // the actual product, not "pay as many months as you want,
          // whenever you want," see getOrCreateOpenInstallmentPayment's own
          // comment. This is the normal, expected state for most of every
          // month, not an error.
          <div className="rounded-xl border border-ink/10 p-4 text-center">
            <p className="text-sm text-slate-100">You&apos;re all paid up for now.</p>
            <p className="mt-1 text-xs text-slate-500">
              {nextInstallmentDueDate
                ? `Your next installment opens for payment on ${new Date(nextInstallmentDueDate).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                  })}. We'll email you when it's ready.`
                : "We'll email you when your next installment is ready to pay."}
            </p>
          </div>
        )}
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

      <div>
        <p className="text-xs font-medium text-slate-400">Your weekly time</p>
        <p className="mt-0.5 mb-2 text-xs text-slate-500">
          Pick one below, it&apos;s yours every week for {termPhrase}, booked for you automatically.
        </p>
        {slotsLoading ? (
          <div className="flex items-center justify-center rounded-lg border border-ink/10 py-6">
            <MorphingSquare size={16} />
          </div>
        ) : slots.length === 0 ? (
          <p className="rounded-lg border border-ink/10 px-3.5 py-3 text-xs text-slate-500">
            No open weekly times for this cadence right now, message us and we&apos;ll help you find one.
          </p>
        ) : (
          <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
            {slotsByDay.map(([dayOfWeek, daySlots]) => (
              <div key={dayOfWeek}>
                <p className="mb-1 text-xs font-medium text-slate-500">{DAY_LABELS[dayOfWeek]}</p>
                <div className="space-y-1.5">
                  {daySlots.map((slot) => {
                    const active = selectedSlot?.scheduleId === slot.scheduleId && selectedSlot?.chunkIndex === slot.chunkIndex;
                    return (
                      <button
                        key={`${slot.scheduleId}:${slot.chunkIndex}`}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition ${
                          active ? "border-[rgb(var(--c-s-50)/0.6)] bg-[rgb(var(--c-s-50)/0.1)]" : "border-ink/10 hover:border-ink/15"
                        }`}
                      >
                        <span className={`text-sm font-medium ${active ? "text-[rgb(var(--c-s-50))]" : "text-slate-100"}`}>
                          {formatTimeLabel(slot.startTime)}
                        </span>
                        {slot.label && <span className="text-xs text-slate-500">{slot.label}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
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
        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
          <span>{classMinutes}-min classes</span>
          <span>
            {classesPerMonth} classes/month
            {rate.termMonths > 1 && ` · ${classesPerMonth * rate.termMonths} total over ${rate.termMonths} months`}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {rate.termMonths === 1
            ? "One Zelle payment for one month, no term, re-enroll any time."
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
            ? `I'm paying for one month (${formatUsd(rate.installmentAmountCents)}), no further commitment.`
            : `I'm committing to ${rate.termMonths} monthly installments of ${formatUsd(rate.installmentAmountCents)} each.`}{" "}
          My selected weekly time is reserved for me exclusively and auto-booked automatically every week this
          plan stays active, I don&apos;t need to book it myself. If a specific week doesn&apos;t work for me, I&apos;ll
          message support rather than rescheduling it myself. Money spent is{" "}
          <span className="font-medium text-[rgb(var(--c-s-50))]">non-refundable</span> once a class happens.
        </span>
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleEnroll}
        disabled={loading || !acknowledged || !selectedSlot}
        className="cta-sheen cta-fill flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <MorphingSquare size={14} className="mr-2 shrink-0" />}
        {loading ? "Starting…" : "Start plan"}
      </button>
    </div>
  );
}
