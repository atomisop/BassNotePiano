import type { PlanCancellationReason } from "@prisma/client";
import { getPlanCancellationFeedback } from "@/lib/paymentPlans";
import { describePaymentPlan } from "@/lib/classCreditPricing";

// Matches ManageSubscriptions.tsx's own CANCELLATION_REASONS labels — kept
// as its own small copy rather than a shared import, same "duplicated on
// purpose" convention this app already uses for small UI label maps (see
// e.g. PaymentPlanTierGrid.tsx and PaymentPlanEnrollmentFlow.tsx both
// defining their own CADENCE_OPTIONS/TERM_OPTIONS rather than sharing one).
const REASON_LABELS: Record<PlanCancellationReason, string> = {
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
 * field, admin-only, shown on /admin/payment-plans instead).
 */
export default async function AdminFeedbackPage() {
  const feedback = await getPlanCancellationFeedback();

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Feedback</h1>
      <p className="mt-2 text-sm text-slate-500">
        {feedback.length} cancellation{feedback.length === 1 ? "" : "s"} with a reason left, newest first.
      </p>

      {feedback.length === 0 ? (
        <p className="mt-6 rounded-xl border border-ink/10 p-6 text-center text-sm text-slate-500">
          Nothing here yet. This fills in as students cancel their own plan and leave a reason.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {feedback.map((plan) => (
            <div key={plan.id} className="glass-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-100">{plan.user.name ?? "Unnamed"}</p>
                  <p className="text-xs text-slate-500">{plan.user.email}</p>
                </div>
                <p className="text-xs text-slate-500">{plan.canceledAt ? formatDate(plan.canceledAt) : ""}</p>
              </div>

              <p className="mt-3 text-xs text-slate-500">{describePaymentPlan(plan.cadence, plan.term)}</p>

              <div className="mt-2 rounded-lg border border-ink/10 bg-slate-900/40 p-3">
                <p className="text-xs font-medium uppercase tracking-[0.1em] text-[rgb(var(--c-s-50))]">
                  {plan.cancellationReason ? REASON_LABELS[plan.cancellationReason] : "No reason given"}
                </p>
                {plan.cancellationReasonNote && (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-300">{plan.cancellationReasonNote}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
