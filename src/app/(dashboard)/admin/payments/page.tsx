import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import type { ZellePaymentStatus } from "@prisma/client";
import { getAdminPayments } from "@/lib/payments";
import { PaymentQueue } from "@/components/admin/PaymentQueue";
import { approvePaymentAction, checkPaymentAction, rejectPaymentAction } from "./actions";

const FILTERS: { label: string; value: ZellePaymentStatus | "ALL" | "UNCHECKED" }[] = [
  { label: "Pending", value: "PENDING_REVIEW" },
  { label: "Unchecked", value: "UNCHECKED" },
  { label: "Verified", value: "VERIFIED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Awaiting", value: "AWAITING_TRANSFER" },
  { label: "Expired", value: "EXPIRED" },
  { label: "All", value: "ALL" },
];

export default async function AdminPaymentsPage({ searchParams }: { searchParams: { status?: string } }) {
  const requested = searchParams.status?.toUpperCase();
  const activeFilter = FILTERS.find((f) => f.value === requested)?.value ?? "PENDING_REVIEW";
  const payments = await getAdminPayments(activeFilter === "ALL" ? undefined : activeFilter);
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Payments</h1>
      <p className="mt-2 text-small text-slate-500">
        {payments.length} payment{payments.length === 1 ? "" : "s"} · {activeLabel.toLowerCase()}
      </p>

      <div className="mt-6">
        <AdminFilterTabs
          label="Payment status"
          mobile="scroll"
          items={FILTERS.map((filter) => ({
            label: filter.label,
            href: filter.value === "PENDING_REVIEW" ? "/admin/payments" : `/admin/payments?status=${filter.value}`,
            active: activeFilter === filter.value,
          }))}
        />
      </div>

      <div className="mt-6">
        <PaymentQueue
          payments={payments}
          onApprove={approvePaymentAction}
          onReject={rejectPaymentAction}
          onCheck={checkPaymentAction}
          emptyMessage={
            activeFilter === "PENDING_REVIEW" ? "Nothing pending review." : `No ${activeLabel.toLowerCase()} payments.`
          }
        />
      </div>
    </div>
  );
}
