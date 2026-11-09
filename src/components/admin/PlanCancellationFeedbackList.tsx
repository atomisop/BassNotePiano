import type { PlanCancellationReason } from "@prisma/client";
import type { PlanCancellationFeedback } from "@/lib/paymentPlans";
import { describePaymentPlan } from "@/lib/classCreditPricing";
import { Hint } from "@/components/ui/Hint";

// Matches ManageSubscriptions.tsx's own CANCELLATION_REASONS labels, kept
// as its own small copy rather than a shared import, same "duplicated on
// purpose" convention this app already uses for small UI label maps (see
// e.g. PaymentPlanTierGrid.tsx and PaymentPlanEnrollmentFlow.tsx both
// defining their own CADENCE_OPTIONS/TERM_OPTIONS rather than sharing one).
const REASON_LABELS: Record<PlanCancellationReason, string> = {
  NON_PAYMENT: "Stopped paying, canceled after a week",
  TOO_EXPENSIVE: "Too expensive",
  NOT_ENOUGH_TIME: "Not enough time to practice or attend",
  SCHEDULE_CONFLICT: "Weekly time no longer worked",
  TAKING_A_BREAK: "Taking a break",
  SWITCHING_TEACHER: "Switching teacher or platform",
  NOT_SATISFIED: "Not satisfied with the classes",
  GOALS_ACHIEVED: "Achieved their learning goals",
  TECHNICAL_ISSUES: "Technical issues with the app or Discord",
  OTHER: "Other",
};

function formatDate(d: Date): string {
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Read-only: who canceled, when, what plan, and why, straight from
 * PaymentPlan.cancellationReason/cancellationReasonNote (see
 * cancelPaymentPlanBySelf in paymentPlans.ts). Only ever populated by a
 * student's own self-cancellation from /account's Manage Subscriptions tab,
 * never an admin cancellation (that one's cancellationNote is a different
 * field, admin-only, shown elsewhere on this same page instead).
 *
 * Was its own top-level /admin/feedback page; folded into Payment Plans as
 * a filter tab instead, by direct instruction, since it's a view onto the
 * exact same PaymentPlan rows this page already manages, not a separate
 * concern.
 */
export function PlanCancellationFeedbackList({ feedback }: { feedback: PlanCancellationFeedback[] }) {
  if (feedback.length === 0) {
    return (
      <p className="mt-6 rounded-xl p-6 text-center text-small text-slate-500 bg-neu-base shadow-raised-low"><Hint>Nothing here yet. This fills in as students cancel their own plan and leave a reason.</Hint></p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {feedback.map((plan) => (
        <div key={plan.id} className="glass-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-small font-medium text-slate-100">{plan.user.name ?? "Unnamed"}</p>
              <p className="text-small text-slate-500">{plan.user.email}</p>
            </div>
            <p className="text-small text-slate-500">{plan.canceledAt ? formatDate(plan.canceledAt) : ""}</p>
          </div>

          <p className="mt-3 text-small text-slate-500">
            {describePaymentPlan(plan.cadence, plan.term)} · {plan.installmentsPaid} of {plan.termMonths} installment
            {plan.termMonths === 1 ? "" : "s"} paid
          </p>

          <div className="mt-2 rounded-lg p-3 bg-neu-base shadow-raised-low">
            <p className="text-small font-medium uppercase tracking-[0.1em] text-slate-50">
              {plan.cancellationReason ? REASON_LABELS[plan.cancellationReason] : "No reason given"}
            </p>
            {plan.cancellationReasonNote && (
              <p className="mt-1.5 whitespace-pre-wrap text-small text-slate-300">{plan.cancellationReasonNote}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
