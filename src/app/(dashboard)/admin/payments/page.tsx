import Link from "next/link";
import type { ZellePaymentStatus } from "@prisma/client";
import { getAdminPayments } from "@/lib/payments";
import { PaymentQueue } from "@/components/admin/PaymentQueue";
import { approvePaymentAction, rejectPaymentAction } from "./actions";

const FILTERS: { label: string; value: ZellePaymentStatus | "ALL" }[] = [
  { label: "Pending", value: "PENDING_REVIEW" },
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

      <div className="mt-6 flex w-fit flex-wrap gap-1.5 rounded-full p-1 bg-neu-base shadow-pressed-low">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === "PENDING_REVIEW" ? "/admin/payments" : `/admin/payments?status=${filter.value}`}
            className={`rounded-full px-3 py-1.5 text-small font-medium transition ${
              activeFilter === filter.value ? "bg-[rgb(var(--signal)/0.14)] text-signal" : "text-slate-400 hover:text-slate-100"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <PaymentQueue
          payments={payments}
          onApprove={approvePaymentAction}
          onReject={rejectPaymentAction}
          emptyMessage={activeFilter === "PENDING_REVIEW" ? "Nothing pending review." : `No ${activeLabel.toLowerCase()} payments.`}
        />
      </div>
    </div>
  );
}
