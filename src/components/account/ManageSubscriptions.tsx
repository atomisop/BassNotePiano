"use client";

import { NumberTicker } from "@/components/ui/number-ticker";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PaymentPlanCadence, PaymentPlanTerm, PlanCancellationReason } from "@prisma/client";
import { calculatePaymentPlanRate, FAMILY_BUNDLE_DISCOUNT_RATE, PLAN_CADENCE_CREDITS_PER_WEEK, isPlanTermOffered, OFFERED_PLAN_CADENCE, CLASS_MINUTES } from "@/lib/classCreditPricing";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const CADENCE_LABELS: Record<PaymentPlanCadence, string> = {
  MIN_30_WEEKLY: "30 min/week",
  MIN_60_WEEKLY: `${CLASS_MINUTES} min/week`,
};

// rank orders the term ladder for the Current/Upgrade/Downgrade comparison
// below: anything ranked higher than the plan's own current term is an
// upgrade (more commitment, a better rate), anything lower is a downgrade.
const TERM_OPTIONS: { value: PaymentPlanTerm; label: string; rank: number }[] = [
  { value: "MONTHLY", label: "Monthly", rank: 0 },
  { value: "TERM_3", label: "3-Month", rank: 1 },
  { value: "TERM_6", label: "6-Month", rank: 2 },
  { value: "TERM_12", label: "Yearly", rank: 3 },
];

// Order here is the picker's own display order. OTHER always last, its own
// free-text box appears only once it's picked (see reasonNote state below).
const CANCELLATION_REASONS: { value: PlanCancellationReason; label: string }[] = [
  { value: "TOO_EXPENSIVE", label: "It's too expensive for me right now" },
  { value: "NOT_ENOUGH_TIME", label: "I don't have enough time to practice or attend" },
  { value: "SCHEDULE_CONFLICT", label: "My weekly time no longer works for me" },
  { value: "TAKING_A_BREAK", label: "I'm taking a break, might come back later" },
  { value: "SWITCHING_TEACHER", label: "I found a different teacher or platform" },
  { value: "NOT_SATISFIED", label: "I wasn't satisfied with the classes" },
  { value: "GOALS_ACHIEVED", label: "I've achieved what I wanted to learn" },
  { value: "TECHNICAL_ISSUES", label: "Technical issues with the app or Discord" },
  { value: "OTHER", label: "Other" },
];

/** Set when the plan is one person's share of a family plan. */
export interface FamilyPlanDetails {
  isPayer: boolean;
  payerName: string | null;
  /** Everyone in the family, the payer first. */
  memberNames: string[];
  /** e.g. "Wednesdays 6:30 PM to 7:15 PM", when known. */
  weeklyTime: string | null;
}

export interface ActivePlanInfo {
  cadence: PaymentPlanCadence;
  term: PaymentPlanTerm;
  installmentsPaid: number;
  termMonths: number;
  family?: FamilyPlanDetails | null;
}

export interface ManageSubscriptionsProps {
  activePlan: ActivePlanInfo | null;
  onChangeTerm: (newTerm: PaymentPlanTerm) => Promise<{ ok: boolean; error: string | null }>;
  onCancel: (reason: PlanCancellationReason, reasonNote: string | null) => Promise<{ ok: boolean; error: string | null }>;
}

type CancelStage = "idle" | "downgrade-offer" | "reason" | "canceling";

/**
 * The account-settings half of the pricing page: the same term ladder
 * /pricing shows (curriculum left out, by direct instruction, that's its
 * own separate purchase, not a subscription to manage), plus what /pricing
 * itself can't show since it doesn't know who's signed in: which term is
 * this student's own, and the tools to change or end it.
 *
 * No active plan: a plain informational grid, cadence-toggleable, every
 * card links out to /billing/plans to actually enroll (which needs to pick
 * a specific weekly slot, a bigger flow than belongs here).
 *
 * Active plan: cadence is fixed (switching it means a new reserved slot,
 * out of scope for an in-place change), and every term card reads Current,
 * Upgrade, or Downgrade against the plan's own term, by direct instruction.
 * Canceling a TERM_6/TERM_12 plan offers a downgrade to TERM_3 first,
 * also by direct instruction, before the reason picker that's required
 * either way (9 options, OTHER needs its own explanation) so the Feedback
 * tab of /admin/payment-plans has something real to read.
 */
export function ManageSubscriptions({ activePlan, onChangeTerm, onCancel }: ManageSubscriptionsProps) {
  const router = useRouter();
  // One plan on offer (45 minutes a week). A plan on a retired length keeps showing its own.
  const cadence: PaymentPlanCadence = activePlan?.cadence ?? OFFERED_PLAN_CADENCE;
  const [pendingTerm, setPendingTerm] = useState<PaymentPlanTerm | null>(null);
  const [termError, setTermError] = useState<string | null>(null);
  const [cancelStage, setCancelStage] = useState<CancelStage>("idle");
  const [reason, setReason] = useState<PlanCancellationReason | null>(null);
  const [reasonNote, setReasonNote] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function handleChangeTerm(term: PaymentPlanTerm) {
    setPendingTerm(term);
    setTermError(null);
    const result = await onChangeTerm(term);
    if (!result.ok) {
      setPendingTerm(null);
      setTermError(result.error ?? "Something went wrong. Please try again.");
      return;
    }
    router.refresh();
  }

  function startCancelFlow() {
    setCancelError(null);
    setCancelStage(activePlan?.term === "TERM_6" || activePlan?.term === "TERM_12" ? "downgrade-offer" : "reason");
  }

  function resetCancelFlow() {
    setCancelStage("idle");
    setReason(null);
    setReasonNote("");
    setCancelError(null);
  }

  async function handleConfirmCancel() {
    if (!reason) return;
    const trimmedNote = reasonNote.trim();
    if (reason === "OTHER" && !trimmedNote) {
      setCancelError('Tell us a bit more since you picked "Other."');
      return;
    }
    setCancelStage("canceling");
    setCancelError(null);
    const result = await onCancel(reason, trimmedNote || null);
    if (!result.ok) {
      setCancelStage("reason");
      setCancelError(result.error ?? "Something went wrong. Please try again.");
      return;
    }
    router.refresh();
  }

  // Same terms the Pricing page and the plan picker offer. Yearly was retired,
  // so it only shows for someone who is still on a Yearly plan (as "Current").
  const visibleTerms = TERM_OPTIONS.filter((t) => isPlanTermOffered(t.value) || t.value === activePlan?.term);

  const currentRank = activePlan ? TERM_OPTIONS.find((t) => t.value === activePlan.term)!.rank : null;

  return (
    <div className="space-y-6">
      <div>
        {activePlan ? (
          <>
            <p className="text-small font-medium text-slate-400">
              Your plan: {CADENCE_LABELS[activePlan.cadence]} · {activePlan.installmentsPaid} of {activePlan.termMonths}{" "}
              installments paid
            </p>
            {activePlan.family && (
              <div className="mt-3 rounded-xl bg-neu-base p-4 text-small text-slate-300 shadow-pressed-low">
                <p className="font-semibold text-slate-50">Family plan</p>
                <p className="mt-1">In this family: {activePlan.family.memberNames.join(", ")}.</p>
                {activePlan.family.weeklyTime && <p className="mt-1">Weekly class together: {activePlan.family.weeklyTime}.</p>}
                <p className="mt-1">
                  {activePlan.family.isPayer
                    ? "You pay everyone's monthly bill from your own bank account."
                    : `${activePlan.family.payerName ?? "The person who set it up"} pays your monthly bill from their own bank account.`}
                </p>
                <p className="mt-1 text-slate-400">The length and weekly time of a family plan are changed by the teacher.</p>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-small font-medium text-slate-400">No active plan.</p>
          </>
        )}

        <div className={`mt-3 grid gap-3 ${visibleTerms.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"} ${activePlan?.family ? "hidden" : ""}`}>
          {visibleTerms.map((option) => {
            const rate = calculatePaymentPlanRate(cadence, option.value);
            const isCurrent = activePlan ? option.value === activePlan.term : false;
            const isUpgrade = currentRank !== null && option.rank > currentRank;
            const pending = pendingTerm === option.value;

            return (
              <div
                key={option.value}
                className={`glass-surface rounded-xl p-4 ${isCurrent ? "border border-[rgb(var(--c-s-50)/0.5)] shadow-pressed-low" : "border border-transparent"}`}
              >
                <p className="text-small font-medium uppercase tracking-[0.1em] text-[rgb(var(--c-s-50))]">{option.label}</p>
                <p className="mt-2 text-body text-slate-50 font-semibold">
                  <NumberTicker value={rate.installmentAmountCents} format={formatUsd} />
                </p>
                {/* Classes/month, not a raw credit count, by direct
                    instruction: same reasoning as PaymentPlanEnrollmentFlow's
                    own classesPerMonth, both cadences work out to 4 classes
                    a month, just a different length each. The total-over-
                    term line below it is new: showing only "4/month" made
                    a 6- or 12-month card look identical to Monthly at a
                    glance, so what a longer term actually adds (more total
                    classes locked in, not a different rate) wasn't visible
                    without doing the multiplication yourself. */}
                {(() => {
                  const perMonth = rate.creditsPerInstallment / PLAN_CADENCE_CREDITS_PER_WEEK[cadence];
                  return (
                    <>
                      <p className="text-small text-slate-500">
                        per month · <NumberTicker value={perMonth} /> classes
                      </p>
                      {option.value !== "MONTHLY" && (
                        <p className="text-small text-slate-500">
                          <NumberTicker value={perMonth * rate.termMonths} /> total over <NumberTicker value={rate.termMonths} /> months
                        </p>
                      )}
                    </>
                  );
                })()}

                {activePlan ? (
                  <button
                    type="button"
                    disabled={isCurrent || pendingTerm !== null}
                    onClick={() => handleChangeTerm(option.value)}
                    className={`tap mt-3 flex w-full items-center justify-center rounded-lg py-2 text-small font-semibold transition disabled:cursor-not-allowed ${
                      isCurrent
                        ? "bg-neu-base shadow-pressed-low text-slate-400"
                        : "text-slate-200 hover:text-[rgb(var(--c-s-50))] disabled:opacity-50 bg-neu-base shadow-raised-low"
                    }`}
                  >
                    {pending && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                    {isCurrent ? "Current" : pending ? "Working…" : isUpgrade ? "Upgrade" : "Downgrade"}
                  </button>
                ) : (
                  <Link
                    href={`/billing/plans?cadence=${cadence}&term=${option.value}`}
                    className="tap mt-3 flex w-full items-center justify-center rounded-lg py-2 text-small font-semibold text-slate-200 transition hover:text-[rgb(var(--c-s-50))] bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                  >
                    Start plan
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        {termError && <p className="mt-3 text-small text-red-400">{termError}</p>}
      </div>

      {/* Family bundle: independent of a solo plan's own state, shown either way, same reasoning /pricing shows it alongside the term grid rather than gating it on anything. */}
      <div className={`glass-surface flex flex-col items-start gap-3 rounded-xl border border-[rgb(var(--c-s-50)/0.2)] p-4 sm:flex-row sm:items-center sm:justify-between ${activePlan?.family ? "hidden" : ""}`}>
        <div>
          <p className="text-small font-medium uppercase tracking-[0.1em] text-[rgb(var(--c-s-50))]">Family bundle</p>
          <p className="mt-1 text-small text-slate-400">
            Buying for 2 or more kids gets an extra {FAMILY_BUNDLE_DISCOUNT_RATE * 100}% off the combined total.
          </p>
        </div>
        <Link
          href="/billing/plans"
          className={buttonVariants({ variant: "secondary", className: "shrink-0" })}
        >
          Bundle &amp; save
        </Link>
      </div>

      {activePlan && (
        <div className="border-t border-ink/10 pt-4">
          {activePlan.family && cancelStage === "idle" && (
            <p className="mb-3 text-small text-slate-400">
              {activePlan.family.isPayer
                ? "You pay for this family. If you cancel, the family plan ends for everyone. Each person keeps the month already paid, with its credits and booked classes."
                : "If you cancel, only you leave the family. If one person is left, they pay the solo price from their next bill."}
            </p>
          )}
          {cancelStage === "idle" && (
            <button type="button" onClick={startCancelFlow} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Cancel subscription
            </button>
          )}

          {cancelStage === "downgrade-offer" && (
            <div className="rounded-xl p-4 bg-neu-base shadow-raised-low">
              <p className="text-small text-slate-100">Before you cancel, want to switch to 3-Month instead?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleChangeTerm("TERM_3")}
                  disabled={pendingTerm !== null}
                  className={buttonVariants({ variant: "primary" })}
                >
                  {pendingTerm === "TERM_3" && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                  Switch to 3-Month
                </button>
                <button
                  type="button"
                  onClick={() => setCancelStage("reason")}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  No, cancel anyway
                </button>
              </div>
            </div>
          )}

          {(cancelStage === "reason" || cancelStage === "canceling") && (
            <div className="rounded-xl border border-red-500/30 bg-neu-base p-4 shadow-pressed-low">
              <p className="text-small text-slate-100">Tell us why you&apos;re canceling.</p>
              <p className="mt-1 text-small text-slate-500">
                This ends your plan and frees your reserved weekly time right away. It can&apos;t be undone from here.
              </p>
              <div className="mt-3 space-y-1.5">
                {CANCELLATION_REASONS.map((r) => (
                  <label key={r.value} className="flex cursor-pointer items-center gap-2 text-small text-slate-300">
                    <input
                      type="radio"
                      name="cancellation-reason"
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      disabled={cancelStage === "canceling"}
                      className="h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-full border border-(--neu-edge) bg-neu-base shadow-pressed-low transition checked:border-red-400/60 checked:bg-[radial-gradient(circle,rgb(239_68_68)_0_38%,transparent_42%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    />
                    {r.label}
                  </label>
                ))}
              </div>
              {reason === "OTHER" && (
                <textarea
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  placeholder="Tell us a bit more"
                  rows={3}
                  disabled={cancelStage === "canceling"}
                  className="mt-3 w-full rounded-lg border border-(--neu-edge) p-3 text-body text-slate-100 outline-none transition focus:border-red-400/60 disabled:opacity-60 bg-neu-base shadow-pressed-low"
                />
              )}
              {cancelError && <p className="mt-2 text-small text-red-400">{cancelError}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={!reason || cancelStage === "canceling"}
                  className={buttonVariants({ variant: "danger" })}
                >
                  {cancelStage === "canceling" && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                  {cancelStage === "canceling" ? "Canceling…" : "Cancel my subscription"}
                </button>
                <button
                  type="button"
                  onClick={resetCancelFlow}
                  disabled={cancelStage === "canceling"}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Never mind
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
