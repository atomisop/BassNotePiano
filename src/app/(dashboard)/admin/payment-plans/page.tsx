import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import type { PaymentPlanStatus } from "@prisma/client";
import { getNumberSetting } from "@/lib/siteSettings";
import { getAdminPaymentPlans, getPlanCancellationFeedback } from "@/lib/paymentPlans";
import { PaymentPlanList } from "@/components/admin/PaymentPlanList";
import { PlanCancellationFeedbackList } from "@/components/admin/PlanCancellationFeedbackList";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { SectionPills } from "@/components/admin/SectionPills";
import { PricingView } from "../pricing/_view";
import { ScholarshipsView } from "../scholarships/_view";
import { FigureLead } from "@/components/admin/AdminLead";
import { AlertCircle, Check, List, MessageSquare, PlayCircle, X } from "@/components/ui/appIcons";
import { cancelPaymentPlanAction, recordPlanPaymentAction, resendBillAction } from "./actions";

// "Overdue" isn't a real PaymentPlanStatus, it's derived (ACTIVE && past its
// nextDueDate) in getAdminPaymentPlans, never stored. This filter just
// narrows the ACTIVE set down to the ones flagged isOverdue after the fact.
// "FEEDBACK" isn't a status at all, it switches the whole list below to
// PlanCancellationFeedbackList instead of PaymentPlanList (see the render
// branch below), folded in here rather than kept as its own /admin/feedback
// tab: it's a read-only view onto these exact same PaymentPlan rows, not a
// separate concern, and didn't earn a whole top-level nav slot on its own.
type FilterValue = PaymentPlanStatus | "OVERDUE" | "ALL" | "FEEDBACK";

// Each status is an icon, the chosen one with its word (the same control as Payments), so all six fit across a phone.
const FILTERS: { label: string; value: FilterValue; icon: React.ReactNode }[] = [
  { label: "Active", value: "ACTIVE", icon: <PlayCircle /> },
  { label: "Overdue", value: "OVERDUE", icon: <AlertCircle /> },
  { label: "Completed", value: "COMPLETED", icon: <Check /> },
  { label: "Canceled", value: "CANCELED", icon: <X /> },
  { label: "All", value: "ALL", icon: <List /> },
  { label: "Feedback", value: "FEEDBACK", icon: <MessageSquare /> },
];

const formatUsd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const metadata = { title: "Admin: Payment plans" };

async function PlansView(props: { searchParams: Promise<{ status?: string }> }) {
  const searchParams = await props.searchParams;
  const requested = searchParams.status?.toUpperCase();
  const activeFilter = FILTERS.find((f) => f.value === requested)?.value ?? "ACTIVE";
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;

  if (activeFilter === "FEEDBACK") {
    const feedback = await getPlanCancellationFeedback();
    return (
      <div>
        <h1 className="sr-only">Plans</h1>

        <div className="mt-3">
          <AdminFilterTabs
            label="Plan status"
            mobile="scroll"
            iconOnly
            items={FILTERS.map((filter) => ({
              label: filter.label,
              icon: filter.icon,
              href: filter.value === "ACTIVE" ? "/admin/payment-plans" : `/admin/payment-plans?status=${filter.value}`,
              active: activeFilter === filter.value,
            }))}
          />
        </div>
        <FigureLead className="mt-4" figure={feedback.length} label={`cancellation${feedback.length === 1 ? "" : "s"} with a reason`} />

        <PlanCancellationFeedbackList feedback={feedback} />
      </div>
    );
  }

  const session = await getServerAuthSession();
  const isOwner = isOwnerEmail(session?.user?.email);
  const statusParam = activeFilter === "ALL" || activeFilter === "OVERDUE" ? undefined : activeFilter;
  const firstBillLapseDays = await getNumberSetting("payments.firstBillLapseDays");
  const fetched = await getAdminPaymentPlans(statusParam);
  const plans = activeFilter === "OVERDUE" ? fetched.filter((plan) => plan.isOverdue) : fetched;
  // Plans that are running and have paid at least once: the same set the Overview counts as "every 28 days".
  const running = plans.filter((plan) => plan.status === "ACTIVE" && plan.installmentsPaid >= 1);
  const overdue = plans.filter((plan) => plan.isOverdue).length;

  return (
    <div>
      <h1 className="sr-only">Payment Plans</h1>

      <div className="mt-3">
        <AdminFilterTabs
          label="Plan status"
          mobile="scroll"
          iconOnly
          items={FILTERS.map((filter) => ({
            label: filter.label,
            icon: filter.icon,
            href: filter.value === "ACTIVE" ? "/admin/payment-plans" : `/admin/payment-plans?status=${filter.value}`,
            active: activeFilter === filter.value,
          }))}
        />
      </div>
      {/* The screen's one fact on one line, figure first: how many plans, what they bring in every 28 days, and who is late. */}
      <FigureLead
        className="mt-4"
        figure={plans.length}
        tone={activeFilter === "OVERDUE" && plans.length > 0 ? "danger" : "default"}
        label={activeFilter === "ALL" ? `plan${plans.length === 1 ? "" : "s"}` : `${activeLabel.toLowerCase()} plan${plans.length === 1 ? "" : "s"}`}
        meta={
          running.length > 0 ? (
            <>
              {formatUsd(running.reduce((sum, plan) => sum + plan.installmentAmountCents, 0))} every 28 days
              {activeFilter !== "OVERDUE" && (overdue > 0 ? <span className="text-red-400"> · {overdue} overdue</span> : " · no one is late")}
            </>
          ) : undefined
        }
      />

      <div className="mt-4">
        <PaymentPlanList
          plans={plans}
          onCancel={cancelPaymentPlanAction}
          onRecordPayment={isOwner ? recordPlanPaymentAction : undefined}
          onResendBill={resendBillAction}
          firstPaymentHoldDays={firstBillLapseDays}
          emptyMessage={activeFilter === "ACTIVE" ? "No active plans." : `No ${activeLabel.toLowerCase()} plans.`}
        />
      </div>
    </div>
  );
}

/** Plans, Prices and Scholarships are one page (2026-11-10): what students are on, and what they pay. */
export default async function AdminPaymentPlansPage(props: { searchParams: Promise<{ status?: string; section?: string }> }) {
  const sp = await props.searchParams;
  const session = await getServerAuthSession();
  const owner = isOwnerEmail(session?.user.email);
  const section = owner && sp.section === "prices" ? "prices" : owner && sp.section === "scholarships" ? "scholarships" : null;
  return (
    <div>
      {owner && (
        <SectionPills
          base="/admin/payment-plans"
          label="Plan views"
          active={section}
          items={[{ label: "Plans", value: null }, { label: "Prices", value: "prices" }, { label: "Scholarships", value: "scholarships" }]}
        />
      )}
      {section === "prices" ? <PricingView /> : section === "scholarships" ? <ScholarshipsView /> : <PlansView searchParams={Promise.resolve(sp)} />}
    </div>
  );
}
