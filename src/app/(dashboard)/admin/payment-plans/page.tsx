import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import type { PaymentPlanStatus } from "@prisma/client";
import { getAdminPaymentPlans, getPlanCancellationFeedback } from "@/lib/paymentPlans";
import { PaymentPlanList } from "@/components/admin/PaymentPlanList";
import { PlanCancellationFeedbackList } from "@/components/admin/PlanCancellationFeedbackList";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { cancelPaymentPlanAction, recordPlanPaymentAction, resendBillAction } from "./actions";
import { PageBack } from "@/components/ui/BackLink";

// "Overdue" isn't a real PaymentPlanStatus, it's derived (ACTIVE && past its
// nextDueDate) in getAdminPaymentPlans, never stored. This filter just
// narrows the ACTIVE set down to the ones flagged isOverdue after the fact.
// "FEEDBACK" isn't a status at all, it switches the whole list below to
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

export const metadata = { title: "Admin: Payment plans" };

export default async function AdminPaymentPlansPage(props: { searchParams: Promise<{ status?: string }> }) {
  const searchParams = await props.searchParams;
  const requested = searchParams.status?.toUpperCase();
  const activeFilter = FILTERS.find((f) => f.value === requested)?.value ?? "ACTIVE";
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;

  if (activeFilter === "FEEDBACK") {
    const feedback = await getPlanCancellationFeedback();
    return (
      <div>
        <div data-deck-header className="deck-header -mt-4 pt-4">
          <PageBack href="/admin" />
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Admin</p>
          <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Plans</h1>
        </div>
        <p className="mt-2 text-small text-slate-500">
          {feedback.length} cancellation{feedback.length === 1 ? "" : "s"}
        </p>

        <div className="mt-6">
          <AdminFilterTabs
            label="Plan status"
            mobile="scroll"
            items={FILTERS.map((filter) => ({
              label: filter.label,
              href: filter.value === "ACTIVE" ? "/admin/payment-plans" : `/admin/payment-plans?status=${filter.value}`,
              active: activeFilter === filter.value,
            }))}
          />
        </div>

        <PlanCancellationFeedbackList feedback={feedback} />
      </div>
    );
  }

  const session = await getServerAuthSession();
  const isOwner = isOwnerEmail(session?.user?.email);
  const statusParam = activeFilter === "ALL" || activeFilter === "OVERDUE" ? undefined : activeFilter;
  const fetched = await getAdminPaymentPlans(statusParam);
  const plans = activeFilter === "OVERDUE" ? fetched.filter((plan) => plan.isOverdue) : fetched;

  return (
    <div>
      <div data-deck-header className="deck-header -mt-4 pt-4">
        <PageBack href="/admin" />
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Admin</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Payment Plans</h1>
      </div>
      <p className="mt-2 text-small text-slate-500">
        {plans.length} plan{plans.length === 1 ? "" : "s"} · {activeLabel.toLowerCase()}
      </p>

      <div className="mt-6">
        <AdminFilterTabs
          label="Plan status"
          mobile="scroll"
          items={FILTERS.map((filter) => ({
            label: filter.label,
            href: filter.value === "ACTIVE" ? "/admin/payment-plans" : `/admin/payment-plans?status=${filter.value}`,
            active: activeFilter === filter.value,
          }))}
        />
      </div>

      <div className="mt-6">
        <PaymentPlanList
          plans={plans}
          onCancel={cancelPaymentPlanAction}
          onRecordPayment={isOwner ? recordPlanPaymentAction : undefined}
          onResendBill={resendBillAction}
          emptyMessage={activeFilter === "ACTIVE" ? "No active plans." : `No ${activeLabel.toLowerCase()} plans.`}
        />
      </div>
    </div>
  );
}
