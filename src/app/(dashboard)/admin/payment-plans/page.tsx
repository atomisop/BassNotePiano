import Link from "next/link";
import type { PaymentPlanStatus } from "@prisma/client";
import { getAdminPaymentPlans } from "@/lib/paymentPlans";
import { PaymentPlanList } from "@/components/admin/PaymentPlanList";
import { cancelPaymentPlanAction } from "./actions";

// "Overdue" isn't a real PaymentPlanStatus — it's derived (ACTIVE && past its
// nextDueDate) in getAdminPaymentPlans, never stored. This filter just
// narrows the ACTIVE set down to the ones flagged isOverdue after the fact.
type FilterValue = PaymentPlanStatus | "OVERDUE" | "ALL";

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: "Active", value: "ACTIVE" },
  { label: "Overdue", value: "OVERDUE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Canceled", value: "CANCELED" },
  { label: "All", value: "ALL" },
];

export default async function AdminPaymentPlansPage({ searchParams }: { searchParams: { status?: string } }) {
  const requested = searchParams.status?.toUpperCase();
  const activeFilter = FILTERS.find((f) => f.value === requested)?.value ?? "ACTIVE";

  const statusParam = activeFilter === "ALL" || activeFilter === "OVERDUE" ? undefined : activeFilter;
  const fetched = await getAdminPaymentPlans(statusParam);
  const plans = activeFilter === "OVERDUE" ? fetched.filter((plan) => plan.isOverdue) : fetched;

  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Payment Plans</h1>
      <p className="mt-2 text-sm text-slate-500">
        {plans.length} plan{plans.length === 1 ? "" : "s"} · {activeLabel.toLowerCase()}
      </p>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">
        Each installment is still approved or rejected from the regular{" "}
        <Link href="/admin/payments" className="text-[rgb(var(--c-s-50))] underline hover:opacity-70">
          Payments queue
        </Link>{" "}
        — this list is for tracking who&apos;s on a plan and canceling one if needed.
      </p>

      <div className="mt-6 flex w-fit flex-wrap gap-1.5 rounded-full border border-ink/10 p-1">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === "ACTIVE" ? "/admin/payment-plans" : `/admin/payment-plans?status=${filter.value}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              activeFilter === filter.value ? "bg-amber-400 text-slate-950" : "text-slate-400 hover:text-slate-100"
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
