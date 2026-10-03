import Link from "next/link";
import type { PaymentPlanStatus } from "@prisma/client";
import { getAdminPaymentPlans, getPlanCancellationFeedback } from "@/lib/paymentPlans";
import { PaymentPlanList } from "@/components/admin/PaymentPlanList";
import { PlanCancellationFeedbackList } from "@/components/admin/PlanCancellationFeedbackList";
import { cancelPaymentPlanAction } from "./actions";

// "Overdue" isn't a real PaymentPlanStatus — it's derived (ACTIVE && past its
// nextDueDate) in getAdminPaymentPlans, never stored. This filter just
// narrows the ACTIVE set down to the ones flagged isOverdue after the fact.
// "FEEDBACK" isn't a status at all — it switches the whole list below to
// PlanCancellationFeedbackList instead of PaymentPlanList (see the render
// branch below), folded in here rather than kept as its own /admin/feedback
// tab: it's a read-only view onto these exact same PaymentPlan rows, not a
// separate concern, and didn't earn a whole top-level nav slot on its own.
type FilterValue = PaymentPlanStatus | "OVERDUE" | "ALL" | "FEEDBACK";

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: "Active", value: "ACTIVE" },
  { label: "Overdue", value: "OVERDUE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Canceled", value: "CANCELED" },
  { label: "All", value: "ALL" },
  { label: "Feedback", value: "FEEDBACK" },
];

export default async function AdminPaymentPlansPage({ searchParams }: { searchParams: { status?: string } }) {
  const requested = searchParams.status?.toUpperCase();
  const activeFilter = FILTERS.find((f) => f.value === requested)?.value ?? "ACTIVE";
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;

  if (activeFilter === "FEEDBACK") {
    const feedback = await getPlanCancellationFeedback();
    return (
      <div>
        <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Payment Plans</h1>
        <p className="mt-2 text-small text-slate-500">
          {feedback.length} cancellation{feedback.length === 1 ? "" : "s"} with a reason left, newest first.
        </p>

        <div className="mt-6 flex w-fit flex-wrap gap-1.5 rounded-full p-1 bg-neu-base shadow-pressed-low">
          {FILTERS.map((filter) => (
            <Link
              key={filter.value}
              href={filter.value === "ACTIVE" ? "/admin/payment-plans" : `/admin/payment-plans?status=${filter.value}`}
              className={`rounded-full px-3 py-1.5 text-small font-medium transition ${
                activeFilter === filter.value ? "bg-[rgb(var(--signal)/0.14)] text-signal" : "text-slate-400 hover:text-slate-100"
              }`}
            >
              {filter.label}
            </Link>
          ))}
        </div>

        <PlanCancellationFeedbackList feedback={feedback} />
      </div>
    );
  }

  const statusParam = activeFilter === "ALL" || activeFilter === "OVERDUE" ? undefined : activeFilter;
  const fetched = await getAdminPaymentPlans(statusParam);
  const plans = activeFilter === "OVERDUE" ? fetched.filter((plan) => plan.isOverdue) : fetched;

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Payment Plans</h1>
      <p className="mt-2 text-small text-slate-500">
        {plans.length} plan{plans.length === 1 ? "" : "s"} · {activeLabel.toLowerCase()}
      </p>
      <p className="mt-2 max-w-2xl text-small text-slate-500">
        Each installment is still approved or rejected from the regular{" "}
        <Link href="/admin/payments" className="text-[rgb(var(--c-s-50))] underline hover:opacity-70">
          Payments queue
        </Link>{" "}
        — this list is for tracking who&apos;s on a plan and canceling one if needed.
      </p>

      <div className="mt-6 flex w-fit flex-wrap gap-1.5 rounded-full p-1 bg-neu-base shadow-pressed-low">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === "ACTIVE" ? "/admin/payment-plans" : `/admin/payment-plans?status=${filter.value}`}
            className={`rounded-full px-3 py-1.5 text-small font-medium transition ${
              activeFilter === filter.value ? "bg-[rgb(var(--signal)/0.14)] text-signal" : "text-slate-400 hover:text-slate-100"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <PaymentPlanList
          plans={plans}
          onCancel={cancelPaymentPlanAction}
          emptyMessage={activeFilter === "ACTIVE" ? "No active plans." : `No ${activeLabel.toLowerCase()} plans.`}
        />
      </div>
    </div>
  );
}
