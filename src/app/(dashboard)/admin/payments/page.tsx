import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import type { ZellePaymentStatus } from "@prisma/client";
import { getAdminPayments } from "@/lib/payments";
import { PaymentQueue } from "@/components/admin/PaymentQueue";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { searchUsersForCredits, getRecentCreditAdjustments } from "@/lib/creditAdjustments";
import { AdminCreditGrantPanel } from "@/components/admin/AdminCreditGrantPanel";
import { searchUsersForCreditsAction, adjustUserCreditsAction, getUserCreditHistoryAction } from "./credit-actions";
import { approvePaymentAction, checkPaymentAction, deletePaymentAction, refundPaymentAction, rejectPaymentAction } from "./actions";

const FILTERS: { label: string; value: ZellePaymentStatus | "ALL" | "UNCHECKED" }[] = [
  { label: "Pending", value: "PENDING_REVIEW" },
  { label: "Unchecked", value: "UNCHECKED" },
  { label: "Verified", value: "VERIFIED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Refunded", value: "REFUNDED" },
  { label: "Awaiting", value: "AWAITING_TRANSFER" },
  { label: "Expired", value: "EXPIRED" },
  { label: "All", value: "ALL" },
];

export default async function AdminPaymentsPage({ searchParams }: { searchParams: { status?: string; tab?: string } }) {
  if (searchParams.tab === "credits") return <CreditsTab />;
  const requested = searchParams.status?.toUpperCase();
  const activeFilter = FILTERS.find((f) => f.value === requested)?.value ?? "PENDING_REVIEW";
  const payments = await getAdminPayments(activeFilter === "ALL" ? undefined : activeFilter);
  const session = await getServerAuthSession();
  const isOwner = isOwnerEmail(session?.user?.email);
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Payments</h1>
      <TopTabs credits={false} />
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

      {isOwner && (
        <a href="/api/admin/export?type=payments" className="tap neu-btn mt-6 inline-flex items-center rounded-lg px-3 py-1.5 text-small font-medium">
          Export CSV
        </a>
      )}

      <div className="mt-6">
        <PaymentQueue
          payments={payments}
          onApprove={approvePaymentAction}
          onReject={rejectPaymentAction}
          onCheck={checkPaymentAction}
          onDelete={isOwner ? deletePaymentAction : undefined}
          onRefund={isOwner ? refundPaymentAction : undefined}
          emptyMessage={
            activeFilter === "PENDING_REVIEW" ? "Nothing pending review." : `No ${activeLabel.toLowerCase()} payments.`
          }
        />
      </div>
    </div>
  );
}

function TopTabs({ credits }: { credits: boolean }) {
  return (
    <div className="mt-6">
      <AdminFilterTabs
        label="Payments section"
        items={[
          { label: "Zelle payments", href: "/admin/payments", active: !credits },
          { label: "Class credits", href: "/admin/payments?tab=credits", active: credits },
        ]}
      />
    </div>
  );
}

async function CreditsTab() {
  const [initialUsers, recentAdjustments] = await Promise.all([searchUsersForCredits(""), getRecentCreditAdjustments(25)]);

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Payments</h1>
      <TopTabs credits />

      <div className="mt-6">
        <AdminCreditGrantPanel
          initialUsers={initialUsers}
          recentAdjustments={recentAdjustments.map((a) => ({
            id: a.id,
            amount: a.amount,
            reasonNote: a.reasonNote,
            createdAtMs: a.createdAt.getTime(),
            userName: a.user.name,
            userEmail: a.user.email,
            adjustedByName: a.adjustedBy.name,
            adjustedByEmail: a.adjustedBy.email,
          }))}
          onSearch={searchUsersForCreditsAction}
          onAdjust={adjustUserCreditsAction}
          onGetHistory={getUserCreditHistoryAction}
        />
      </div>
    </div>
  );
}
