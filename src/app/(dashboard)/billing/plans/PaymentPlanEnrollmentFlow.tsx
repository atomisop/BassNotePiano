"use client";

import { NumberTicker } from "@/components/ui/number-ticker";
import { useEffect, useMemo, useState } from "react";
import type { PaymentPlanCadence, PaymentPlanTerm, ZellePaymentStatus } from "@prisma/client";
import { calculatePaymentPlanRate, describePaymentPlan, CLASS_MINUTES, OFFERED_PLAN_CADENCE, PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";
import type { ReservableSlot } from "@/lib/classSchedule";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { BookingCalendar } from "../../lessons/BookingCalendar";
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

/** Start time plus the plan's class length, e.g. "6:00 PM to 6:30 PM". */
function formatTimeRange(startHHmm: string, minutes: number): string {
  const [h, m] = startHHmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${formatTimeLabel(startHHmm)} to ${formatTimeLabel(`${Math.floor(total / 60) % 24}:${String(total % 60).padStart(2, "0")}`)}`;
}

/** The next `weeks` calendar dates (as UTC-midnight ms, the key BookingCalendar uses) that fall on `dayOfWeek`, starting today. */
function upcomingDatesFor(dayOfWeek: number, weeks: number): number[] {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const ahead = (dayOfWeek - now.getDay() + 7) % 7;
  return Array.from({ length: weeks }, (_, i) => today + (ahead + i * 7) * 86_400_000);
}


const TERM_OPTIONS: { value: PaymentPlanTerm; label: string }[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "TERM_3", label: "3-Month" },
  { value: "TERM_6", label: "6-Month" },
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
  // One plan: a 45-minute class a week. (initialCadence from old links is ignored.)
  const cadence: PaymentPlanCadence = OFFERED_PLAN_CADENCE;
  const [term, setTerm] = useState<PaymentPlanTerm>(initialTerm ?? "TERM_6");
  const [slots, setSlots] = useState<ReservableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<ReservableSlot | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
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
  const classMinutes = CLASS_MINUTES;
  const termPhrase = rate.termMonths === 1 ? "this month" : `your whole ${rate.termMonths}-month term`;

  // A calendar like the class booking page: every open weekly time shows up
  // on the next few dates that fall on its weekday, so you pick a day you can
  // see, then a time. What you are really choosing is "every <weekday> at
  // <time>", locked in for the term; the dates are just a friendly way to
  // point at it.
  const calendarRows = useMemo(
    () => slots.flatMap((slot) => upcomingDatesFor(slot.dayOfWeek, 6).map((ms) => ({ occurrenceDateMs: ms, isBooked: false, slot }))),
    [slots],
  );
  const daySlots = useMemo(() => {
    if (!selectedDateKey) return [];
    const weekday = new Date(`${selectedDateKey}T00:00:00Z`).getUTCDay();
    return slots.filter((slot) => slot.dayOfWeek === weekday).sort((x, y) => x.startTime.localeCompare(y.startTime));
  }, [slots, selectedDateKey]);

  // Re-fetched whenever cadence changes (not term — a slot's room only
  // depends on the weekly credit cost, which is cadence-only, see
  // PLAN_CADENCE_CREDITS_PER_WEEK). Selection is cleared on change rather
  // than silently carried over, since the previous pick might not even be
  // in the new list.
  useEffect(() => {
    let cancelled = false;
    setSlotsLoading(true);
    setSelectedSlot(null);
    setSelectedDateKey(null);
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
        <div className="mb-4 rounded-xl p-4 bg-neu-base shadow-raised-low">
          <p className="text-small text-slate-100">{planLabel}</p>
          <p className="mt-1 text-small text-slate-500">
            {plan.installmentsPaid} of {plan.termMonths} installments paid
          </p>
          <ProgressBar className="mt-2" value={progressPercent} label="Installments paid" />
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
          <div className="rounded-xl p-4 text-center bg-neu-base shadow-raised-low">
            <p className="text-small text-slate-100">You&apos;re all paid up for now.</p>
            {nextInstallmentDueDate && (
              <p className="mt-1 text-small text-slate-500">
                {`Your next installment opens for payment on ${new Date(nextInstallmentDueDate).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                })}.`}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-small font-medium text-slate-400">Term</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TERM_OPTIONS.map((option) => {
            const active = term === option.value;
            // Off the Monthly rate, from the real (rounded) prices, so the badge can't disagree with them.
            const percentOff = Math.round(
              (1 - calculatePaymentPlanRate(cadence, option.value).installmentAmountCents / calculatePaymentPlanRate(cadence, "MONTHLY").installmentAmountCents) * 100,
            );
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTerm(option.value)}
                className={`rounded-lg border px-3 py-3 text-center transition ${
                  active ? "border-[rgb(var(--c-s-50)/0.6)] bg-[rgb(var(--c-s-50)/0.1)]" : "border-transparent bg-neu-base shadow-raised-low"
                }`}
              >
                <p className={`text-small font-medium ${active ? "text-[rgb(var(--c-s-50))]" : "text-slate-100"}`}>{option.label}</p>
                <p className="mt-0.5 text-small text-slate-500">
                  {percentOff > 0 ? (
                    <>
                      −<NumberTicker value={percentOff} />%
                    </>
                  ) : (
                    "No commitment"
                  )}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-3 text-small font-medium text-slate-400">Your weekly time</p>
        {slotsLoading ? (
          <div className="flex items-center justify-center rounded-lg py-6 bg-neu-base shadow-raised-low">
            <MorphingSquare size={16} />
          </div>
        ) : slots.length === 0 ? (
          <p className="rounded-lg px-3.5 py-3 text-small text-slate-500 bg-neu-base shadow-raised-low">
            No open weekly times right now.
          </p>
        ) : (
          <>
            <BookingCalendar
              occurrences={calendarRows}
              selectedDateKey={selectedDateKey}
              onSelectDate={(key) => {
                setSelectedDateKey(key);
                setSelectedSlot(null);
              }}
            />
            <div className="mt-4">
              {!selectedDateKey ? (
                <p className="text-small text-slate-500">Pick a day.</p>
              ) : (
                <>
                  <p className="mb-2 text-small font-medium text-slate-300">
                    {new Date(`${selectedDateKey}T00:00:00Z`).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {daySlots.map((slot) => {
                      const active = selectedSlot?.scheduleId === slot.scheduleId && selectedSlot?.chunkIndex === slot.chunkIndex;
                      return (
                        <button
                          key={`${slot.scheduleId}:${slot.chunkIndex}`}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          aria-pressed={active}
                          className={`tap flex min-h-11 items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition bg-neu-base ${
                            active ? "shadow-pressed-low" : "shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                          }`}
                        >
                          <span className={`text-small font-semibold ${active ? "text-[rgb(var(--c-s-50))]" : "text-slate-100"}`}>
                            {formatTimeRange(slot.startTime, classMinutes)}
                          </span>
                          <span className="text-small text-slate-500">{active ? "Selected" : slot.label ?? `${classMinutes} min`}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            {selectedSlot && (
              <p className="mt-3 rounded-xl bg-neu-base px-3.5 py-3 text-small text-slate-300 shadow-pressed-low">
                Locked in every <span className="font-semibold text-slate-50">{DAY_LABELS[selectedSlot.dayOfWeek]}</span> at{" "}
                <span className="font-semibold text-slate-50">{formatTimeRange(selectedSlot.startTime, classMinutes)}</span>{" "}
                for {termPhrase}.
              </p>
            )}
          </>
        )}
      </div>

      <div className="rounded-xl p-4 sm:p-5 bg-neu-base shadow-raised-low">
        <div className="flex items-center justify-between text-small text-slate-400">
          <span>
            <NumberTicker value={rate.installmentAmountCents} format={formatUsd} />
            {rate.termMonths === 1 ? (
              ", one month"
            ) : (
              <>
                /month × <NumberTicker value={rate.termMonths} /> months
              </>
            )}
          </span>
          <NumberTicker value={rate.totalCommittedCents} format={formatUsd} />
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-ink/10 pt-2 text-body font-semibold text-slate-50">
          <span>{rate.termMonths === 1 ? "Due now" : "Due each month"}</span>
          <NumberTicker value={rate.installmentAmountCents} format={formatUsd} />
        </div>
        <div className="mt-1 flex items-center justify-between text-small text-slate-500">
          <span>{classMinutes}-min classes</span>
          <span>
            <NumberTicker value={classesPerMonth} /> classes/month
            {rate.termMonths > 1 && (
              <>
                {" "}
                · <NumberTicker value={classesPerMonth * rate.termMonths} /> total over <NumberTicker value={rate.termMonths} /> months
              </>
            )}
          </span>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[rgb(var(--c-s-50)/0.2)] bg-[rgb(var(--c-s-50)/0.05)] p-3.5 text-small text-slate-300">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink/10 bg-slate-950 accent-[rgb(var(--c-s-50))]"
        />
        <span>
          {rate.termMonths === 1 ? (
            <>
              I&apos;m paying for one month (<NumberTicker value={rate.installmentAmountCents} format={formatUsd} />), no further commitment.
            </>
          ) : (
            <>
              I&apos;m committing to <NumberTicker value={rate.termMonths} /> monthly installments of{" "}
              <NumberTicker value={rate.installmentAmountCents} format={formatUsd} /> each.
            </>
          )}{" "}
          My selected weekly time is reserved for me exclusively and auto-booked automatically every week this
          plan stays active, I don&apos;t need to book it myself. If a specific week doesn&apos;t work for me, I&apos;ll
          message support rather than rescheduling it myself. Money spent is{" "}
          <span className="font-medium text-[rgb(var(--c-s-50))]">non-refundable</span> once a class happens.
        </span>
      </label>

      {error && <p className="text-small text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleEnroll}
        disabled={loading || !acknowledged || !selectedSlot}
        className="cta-sheen cta-fill flex w-full items-center justify-center rounded-xl py-2.5 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <MorphingSquare size={14} className="mr-2 shrink-0" />}
        {loading ? "Starting…" : "Start plan"}
      </button>
    </div>
  );
}
