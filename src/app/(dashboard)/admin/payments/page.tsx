import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import type { ZellePaymentStatus } from "@prisma/client";
import { getAdminPayments } from "@/lib/payments";
import { PaymentQueue } from "@/components/admin/PaymentQueue";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { searchUsersForCredits, getRecentCreditAdjustments } from "@/lib/creditAdjustments";
import { AdminCreditGrantPanel } from "@/components/admin/AdminCreditGrantPanel";
import { searchUsersForCreditsAction, adjustUserCreditsAction, getUserCreditHistoryAction } from "./credit-actions";
import { BulkConfirmButton } from "@/components/admin/BulkConfirmButton";
import Link from "next/link";
import { approvePaymentAction, checkAllPaymentsAction, checkPaymentAction, deletePaymentAction, dismissReceiptAction, ignoreSenderAction, matchReceiptAction, refundPaymentAction, rejectPaymentAction } from "./actions";
import { countUnmatchedReceipts, getPaymentPipelineHealth } from "@/lib/paymentPipelineStatus";
import { listUnmatchedReceipts } from "@/lib/paymentReceipts";
import { PaymentPipelineBanner } from "@/components/admin/PaymentPipelineBanner";
import { UnmatchedEmailList } from "@/components/admin/UnmatchedEmailList";

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

export const metadata = { title: "Admin: Payments" };

export default async function AdminPaymentsPage({ searchParams }: { searchParams: { status?: string; tab?: string; page?: string } }) {
  if (searchParams.tab === "credits") return <CreditsTab />;
  if (searchParams.tab === "emails") return <EmailsTab />;
  const requested = searchParams.status?.toUpperCase();
  const activeFilter = FILTERS.find((f) => f.value === requested)?.value ?? "PENDING_REVIEW";
  const [{ payments, total, page, pageCount }, health, unmatched] = await Promise.all([
    getAdminPayments(activeFilter === "ALL" ? undefined : activeFilter, Number(searchParams.page) || 1),
    getPaymentPipelineHealth(),
    countUnmatchedReceipts(),
  ]);
  const session = await getServerAuthSession();
  const isOwner = isOwnerEmail(session?.user?.email);
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Payments</h1>
      <TopTabs active="payments" unmatched={unmatched} />
      <PaymentPipelineBanner health={health} />
      <p className="mt-2 text-small text-slate-500">
        {total} payment{total === 1 ? "" : "s"} · {activeLabel.toLowerCase()}
        {pageCount > 1 ? ` · page ${page} of ${pageCount}` : ""}
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

      {activeFilter === "UNCHECKED" && total > 0 && (
        <div className="mt-6">
          <BulkConfirmButton
            label={`Mark all ${total} as checked`}
            question={`Mark all ${total} auto-approved payment${total === 1 ? "" : "s"} as checked? Do this after you have looked through them.`}
            confirmLabel="Yes, mark them all"
            onConfirm={checkAllPaymentsAction}
          />
        </div>
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

      {pageCount > 1 && (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3 text-small">
          {page > 1 ? (
            <Link href={pageHref(activeFilter, page - 1)} className="tap neu-btn inline-flex items-center rounded-lg px-3 py-1.5 font-medium">
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-slate-500">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={pageHref(activeFilter, page + 1)} className="tap neu-btn inline-flex items-center rounded-lg px-3 py-1.5 font-medium">
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

function pageHref(filter: string, page: number) {
  const params = new URLSearchParams();
  if (filter !== "PENDING_REVIEW") params.set("status", filter);
  if (page > 1) params.set("page", String(page));
  const q = params.toString();
  return q ? `/admin/payments?${q}` : "/admin/payments";
}

function TopTabs({ active, unmatched }: { active: "payments" | "emails" | "credits"; unmatched: number }) {
  return (
    <div className="mt-6">
      <AdminFilterTabs
        label="Payments section"
        items={[
          { label: "Zelle payments", href: "/admin/payments", active: active === "payments" },
          { label: unmatched > 0 ? `Unmatched emails (${unmatched})` : "Unmatched emails", href: "/admin/payments?tab=emails", active: active === "emails" },
          { label: "Class credits", href: "/admin/payments?tab=credits", active: active === "credits" },
        ]}
      />
    </div>
  );
}

/** Bank and Venmo emails that matched no payment: attach each to a payment for the same amount, or dismiss it. */
async function EmailsTab() {
  const [rows, health, session] = await Promise.all([listUnmatchedReceipts(), getPaymentPipelineHealth(), getServerAuthSession()]);
  const isOwner = isOwnerEmail(session?.user?.email);
  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Payments</h1>
      <TopTabs active="emails" unmatched={rows.length} />
      <PaymentPipelineBanner health={health} />
      <p className="mt-2 max-w-[70ch] text-small text-slate-500">
        These emails arrived but matched no student by name and amount, so no payment was approved from them. Attach one to an open
        payment for the same amount, or dismiss it if it is not a studio payment.
      </p>
      <div className="mt-6">
        <UnmatchedEmailList
          rows={rows.map((r) => ({
            id: r.id,
            method: r.method,
            senderName: r.senderName,
            amountCents: r.amountCents,
            memo: r.memo,
            senderPhoneLast4: r.senderPhoneLast4,
            receivedAtMs: r.receivedAt.getTime(),
            candidates: r.candidates.map((c) => ({
              id: c.id,
              status: c.status,
              studentName: c.studentName,
              studentEmail: c.studentEmail,
              createdAtMs: c.createdAt.getTime(),
              phoneMatch: c.phoneMatch,
            })),
          }))}
          onMatch={matchReceiptAction}
          onDismiss={dismissReceiptAction}
          onIgnoreSender={isOwner ? ignoreSenderAction : undefined}
        />
      </div>
    </div>
  );
}

async function CreditsTab() {
  const [initialUsers, recentAdjustments] = await Promise.all([searchUsersForCredits(""), getRecentCreditAdjustments(25)]);

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Payments</h1>
      <TopTabs active="credits" unmatched={await countUnmatchedReceipts()} />

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
