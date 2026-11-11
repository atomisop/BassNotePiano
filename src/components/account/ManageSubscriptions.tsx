"use client";

import { useState } from "react";
import { ArrowLeft } from "@/components/ui/appIcons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PaymentPlanCadence, PaymentPlanTerm, PlanCancellationReason } from "@prisma/client";
import { calculatePaymentPlanRate, discountedPlanPriceCents, discountPercentForTerm, PLAN_CADENCE_CREDITS_PER_WEEK, OFFERED_PLAN_CADENCE, CLASS_MINUTES } from "@/lib/classCreditPricing";
import { isPlanTermOffered } from "@/lib/classCreditPricing";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { COVERED_BY_SCHOLARSHIP, NOTHING_TO_PAY, isCoveredPlan } from "@/lib/scholarshipWording";
import { usePricing } from "@/components/billing/PricingContext";
import { toast } from "@/components/ui/Toaster";
import { Dialog } from "@/components/ui/Dialog";
import { PaymentPlanTierGrid } from "@/components/marketing/PaymentPlanTierGrid";
import { planProgress } from "@/lib/planProgress";
import { Fact, Facts } from "@/components/ui/CardKit";
import { StatusDot } from "@/components/ui/StatusDot";

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
  { value: "MONTHLY", label: "1 Month", rank: 0 },
  { value: "TERM_3", label: "3 Months", rank: 1 },
  { value: "TERM_6", label: "6 Months", rank: 2 },
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

/** Set when the plan is one person's share of a group plan. */
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
  /** What each bill of this plan costs (the price it was started at). */
  installmentAmountCents?: number;
  /** ISO date the next bill is due. */
  nextDueDate?: string | null;
  family?: FamilyPlanDetails | null;
  /** ISO date the current pause ends, when one is running. */
  pausedUntil?: string | null;
  /** Paused by the studio with no end date. */
  pausedIndefinitely?: boolean;
  /** ISO date of the last pause, for the once-in-90-days limit. */
  pausedAt?: string | null;
}

export interface ManageSubscriptionsProps {
  activePlan: ActivePlanInfo | null;
  onChangeTerm: (newTerm: PaymentPlanTerm) => Promise<{ ok: boolean; error: string | null }>;
  onCancel: (reason: PlanCancellationReason, reasonNote: string | null) => Promise<{ ok: boolean; error: string | null }>;
  /** Opened from a "Change length" or "Cancel plan" row (Billing > Plans): start on that step instead of the summary. */
  startOn?: "summary" | "switch" | "cancel";
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
const isOffered = isPlanTermOffered;

export function ManageSubscriptions({ activePlan, onChangeTerm, onCancel, startOn = "summary" }: ManageSubscriptionsProps) {
  const router = useRouter();
  // The owner's current prices and this account's own discount, from the signed-in layout.
  const { pricing, personalDiscountPercent, scholarshipPercent } = usePricing();
  // One plan on offer (45 minutes a week). A plan on a retired length keeps showing its own.
  const cadence: PaymentPlanCadence = activePlan?.cadence ?? OFFERED_PLAN_CADENCE;
  const [view, setView] = useState<"summary" | "switch">(startOn === "switch" && activePlan && !activePlan.family ? "switch" : "summary");
  const [confirmTerm, setConfirmTerm] = useState<PaymentPlanTerm | null>(null);
  const [pendingTerm, setPendingTerm] = useState<PaymentPlanTerm | null>(null);
  const [termError, setTermError] = useState<string | null>(null);
  const [cancelStage, setCancelStage] = useState<CancelStage>(
    startOn === "cancel" && activePlan ? (activePlan.term === "TERM_6" || activePlan.term === "TERM_12" ? "downgrade-offer" : "reason") : "idle",
  );
  const [reason, setReason] = useState<PlanCancellationReason | null>(null);
  const [reasonNote, setReasonNote] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function handleChangeTerm(term: PaymentPlanTerm) {
    setPendingTerm(term);
    setTermError(null);
    const hold = await toast.held("Changing your plan length", () => onChangeTerm(term), { mail: true });
    if (hold.undone) {
      setPendingTerm(null);
      return;
    }
    const result = hold.value;
    if (!result.ok) {
      const message = result.error ?? "Something went wrong. Please try again.";
      setPendingTerm(null);
      setConfirmTerm(null);
      setTermError(message);
      toast.error("Couldn't change your plan", { description: message });
      return;
    }
    toast.success("Plan updated");
    setPendingTerm(null);
    setConfirmTerm(null);
    setView("summary");
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
    const hold = await toast.held("Canceling your plan", () => onCancel(reason, trimmedNote || null), { mail: true });
    if (hold.undone) {
      setCancelStage("reason");
      return;
    }
    const result = hold.value;
    if (!result.ok) {
      const message = result.error ?? "Something went wrong. Please try again.";
      setCancelStage("reason");
      setCancelError(message);
      toast.error("Couldn't cancel your plan", { description: message });
      return;
    }
    toast.info("Plan canceled");
    router.refresh();
  }

  const progress = activePlan ? planProgress(activePlan) : null;
  const currentLabel = activePlan ? (TERM_OPTIONS.find((t) => t.value === activePlan.term)?.label ?? "Your plan") : null;
  const canSwitch = Boolean(activePlan && !activePlan.family);

  // What a switch would do, for the confirm step. Same maths the server uses.
  const switchPreview = (() => {
    if (!activePlan || !confirmTerm) return null;
    const list = calculatePaymentPlanRate(cadence, confirmTerm, pricing);
    const percent = discountPercentForTerm({ percent: personalDiscountPercent, scholarshipPercent }, confirmTerm);
    const price = percent > 0 ? discountedPlanPriceCents(list.installmentAmountCents, percent) : list.installmentAmountCents;
    const left = list.termMonths - activePlan.installmentsPaid;
    return { price, total: list.termMonths, left, blocked: left <= 0, label: TERM_OPTIONS.find((t) => t.value === confirmTerm)?.label ?? "" };
  })();

  return (
    <div className="space-y-6">
      {!activePlan && (
        <div>
          <PaymentPlanTierGrid narrow pricing={pricing} personalDiscountPercent={personalDiscountPercent} scholarshipPercent={scholarshipPercent} />
        </div>
      )}

      {activePlan && progress && view === "summary" && (
        <div className="space-y-4">
          {/* Already inside the settings card, so no second box: the plan's name is the one loud line, its facts small under it. */}
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-caption font-medium uppercase tracking-caps text-slate-500">Your plan</p>
                <p className="mt-1 text-title font-semibold text-slate-50">{currentLabel}</p>
                {activePlan.installmentAmountCents !== undefined && (
                  <p className="mt-0.5 text-small text-slate-400">
                    {isCoveredPlan(activePlan.installmentAmountCents) ? COVERED_BY_SCHOLARSHIP : `${formatUsd(activePlan.installmentAmountCents)} every 28 days`} · {CADENCE_LABELS[activePlan.cadence]}
                  </p>
                )}
              </div>
              {(activePlan.pausedIndefinitely || activePlan.pausedUntil) && (
                <StatusDot tone="warning" className="shrink-0 pt-0.5">
                  {activePlan.pausedUntil ? `Paused to ${new Date(activePlan.pausedUntil).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}` : "Paused"}
                </StatusDot>
              )}
            </div>

            {/* A full scholarship has no bills to count: only what it costs (nothing) and when the next 28 days start. */}
            {isCoveredPlan(activePlan.installmentAmountCents) ? (
              <Facts className="mt-4">
                <Fact label="To pay" value={NOTHING_TO_PAY} />
                <Fact
                  label="Next 28 days start"
                  value={progress.nextBillAt ? progress.nextBillAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }) : "None"}
                  tone={progress.nextBillAt ? "default" : "muted"}
                />
              </Facts>
            ) : (
            <>
            <div className="mt-4" role="img" aria-label={`${progress.billsPaid} of ${progress.billsTotal} bills paid`}>
              <div className="flex gap-1">
                {Array.from({ length: progress.billsTotal }, (_, i) => (
                  <span key={i} className={`h-1.5 min-w-0 flex-1 rounded-full ${i < progress.billsPaid ? "bg-signal" : "bg-slate-50/10"}`} />
                ))}
              </div>
            </div>

            <Facts className="mt-4">
              <Fact label="Bills paid" value={`${progress.billsPaid} of ${progress.billsTotal}`} />
              <Fact label={progress.billsLeft === 1 ? "Bill left" : "Bills left"} value={progress.billsLeft} />
              <Fact label="Days paid" value={`${progress.daysCovered} of ${progress.daysTotal}`} />
              <Fact
                label="Next bill"
                value={progress.nextBillAt ? progress.nextBillAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }) : "None"}
                tone={progress.nextBillAt ? "default" : "muted"}
              />
            </Facts>
            </>
            )}

            {activePlan.pausedIndefinitely && <p className="mt-3 text-small text-amber-300">Paused until the studio resumes it.</p>}

            {canSwitch && (
              <button type="button" onClick={() => setView("switch")} className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4" })}>
                Switch plan
              </button>
            )}
          </div>

          {activePlan.family && (
            <div className="border-t border-slate-50/8 pt-4 text-small text-slate-400">
              <p className="font-semibold text-slate-100">Group plan</p>
              <p className="mt-1">The length and weekly time of a group plan are changed by the teacher.</p>
              <p className="mt-1">In this group: {activePlan.family.memberNames.join(", ")}.</p>
              {activePlan.family.weeklyTime && <p className="mt-1">Weekly class together: {activePlan.family.weeklyTime}.</p>}
              <p className="mt-1">
                {activePlan.family.isPayer
                  ? "You pay everyone's 28-day bill from your own bank account."
                  : `${activePlan.family.payerName ?? "The person who set it up"} pays your 28-day bill from their own bank account.`}
              </p>
            </div>
          )}
        </div>
      )}

      {activePlan && view === "switch" && canSwitch && (
        <div>
          <button type="button" onClick={() => setView("summary")} className="tap mb-4 flex items-center gap-1.5 text-small text-slate-400 transition hover:text-slate-100">
            <ArrowLeft aria-hidden className="h-4 w-4" />
            Back to your plan
          </button>
          <p className="mb-5 text-title font-semibold text-slate-50">Switch your plan</p>
          <PaymentPlanTierGrid
            narrow
            pricing={pricing}
            personalDiscountPercent={personalDiscountPercent}
            scholarshipPercent={scholarshipPercent}
            switchTo={{ currentTerm: TERM_OPTIONS.some((t) => t.value === activePlan.term && isOffered(t.value)) ? activePlan.term : null, pendingTerm, onSwitch: setConfirmTerm }}
          />
          {termError && <p className="mt-3 text-center text-small text-red-400">{termError}</p>}
        </div>
      )}

      <Dialog
        open={confirmTerm !== null}
        onOpenChange={(open) => !open && pendingTerm === null && setConfirmTerm(null)}
        title={switchPreview ? `Switch to ${switchPreview.label}?` : "Switch plan"}
        footer={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!switchPreview || switchPreview.blocked || pendingTerm !== null}
              onClick={async () => {
                if (!confirmTerm) return;
                await handleChangeTerm(confirmTerm);
              }}
              className={buttonVariants({ variant: "primary" })}
            >
              {pendingTerm !== null && <MorphingSquare size={14} className="mr-2 shrink-0" />}
              {pendingTerm !== null ? "Switching…" : "Yes, switch"}
            </button>
            <button type="button" disabled={pendingTerm !== null} onClick={() => setConfirmTerm(null)} className={buttonVariants({ variant: "secondary" })}>
              Not now
            </button>
          </div>
        }
      >
        {switchPreview && activePlan && (
          <div className="space-y-2 text-small text-slate-300">
            {switchPreview.blocked ? (
              <p>
                You have already paid {activePlan.installmentsPaid} bills, which is as many as {switchPreview.label} asks for. Pick a longer plan, or cancel if you want to stop here.
              </p>
            ) : (
              <>
                <p>
                  Your next bill becomes <span className="font-semibold text-slate-50">{formatUsd(switchPreview.price)}</span>, still every 28 days.
                </p>
                <p>
                  {switchPreview.label} has {switchPreview.total} {switchPreview.total === 1 ? "bill" : "bills"} in all. You have paid {activePlan.installmentsPaid}, so{" "}
                  {switchPreview.left} {switchPreview.left === 1 ? "is" : "are"} left.
                </p>
                <p className="text-slate-400">Your weekly time stays the same.</p>
              </>
            )}
          </div>
        )}
      </Dialog>

      {activePlan && view === "summary" && (
        <div className="border-t border-ink/10 pt-4">
          {activePlan.family && cancelStage === "idle" && (
            <p className="mb-2 text-small text-slate-500">
              {activePlan.family.isPayer
                ? "You pay for this family. If you cancel, the group plan ends for everyone. Each person keeps the 28 days already paid, with its credits and booked classes."
                : "If you cancel, only you leave the family. If one person is left, they pay the solo price from their next bill."}
            </p>
          )}
          {/* The one destructive action: quiet red words at the end, still behind its reason step and confirm. */}
          {cancelStage === "idle" && (
            <button type="button" onClick={startCancelFlow} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 text-red-300 hover:text-red-200" })}>
              Cancel subscription
            </button>
          )}

          {cancelStage === "downgrade-offer" && (
            <div className="rounded-xl p-4 bg-neu-base shadow-raised-low">
              <p className="text-small text-slate-100">Before you cancel, want to switch to 3 Months instead?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleChangeTerm("TERM_3")}
                  disabled={pendingTerm !== null}
                  className={buttonVariants({ variant: "primary" })}
                >
                  {pendingTerm === "TERM_3" && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                  Switch to 3 Months
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
              <p className="mt-1 text-small text-slate-400">This ends your plan and frees your reserved weekly time right away. It can&apos;t be undone from here.</p>
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
