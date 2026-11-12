import type { PlanCancellationReason } from "@prisma/client";
import type { PlanCancellationFeedback } from "@/lib/paymentPlans";
import { describePaymentPlan } from "@/lib/classCreditPricing";
import { Meta } from "@/components/ui/CardKit";
import Link from "next/link";

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
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });
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
      <p className="mt-6 rounded-xl p-6 text-center text-small text-slate-500 bg-neu-base shadow-raised-low">Nothing here yet. This fills in as students cancel their own plan and leave a reason.</p>
    );
  }

  // Why they left is the point, so the reason leads each row; their own words follow, and who, which plan and when are one quiet line.
  return (
    <ul className="mt-6 divide-y divide-slate-50/6 overflow-hidden rounded-card bg-neu-base shadow-raised-mid">
      {feedback.map((plan) => (
        <li key={plan.id} className="px-4 py-3.5 md:px-5">
          <p className={`text-body font-semibold ${plan.cancellationReason ? "text-slate-50" : "text-slate-400"}`}>
            {plan.cancellationReason ? REASON_LABELS[plan.cancellationReason] : "No reason given"}
          </p>
          {plan.cancellationReasonNote && (
            <p className="mt-1 whitespace-pre-wrap text-small text-slate-300">&ldquo;{plan.cancellationReasonNote}&rdquo;</p>
          )}
          <Meta
            className="mt-1.5"
            items={[
              <Link key="who" href={`/admin/users/${plan.user.id}`} className="rounded-sm font-medium text-slate-300 hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {plan.user.name ?? plan.user.email}
              </Link>,
              describePaymentPlan(plan.cadence, plan.term),
              `${plan.installmentsPaid} of ${plan.termMonths} paid`,
              plan.canceledAt ? formatDate(plan.canceledAt) : null,
            ]}
          />
        </li>
      ))}
    </ul>
  );
}
