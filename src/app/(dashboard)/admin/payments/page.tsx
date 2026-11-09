import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import { Hint } from "@/components/ui/Hint";
import { countUpcomingClasses, getAdminPayments, locateAdminPayment } from "@/lib/payments";
import { adminPaymentsHref, readAdminPaymentsParams, type PaymentFilterValue } from "@/lib/adminPaymentLinks";
import { prisma } from "@/lib/prisma";
import { PaymentQueue } from "@/components/admin/PaymentQueue";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { searchUsersForCredits, getRecentCreditAdjustments } from "@/lib/creditAdjustments";
import { AdminCreditGrantPanel } from "@/components/admin/AdminCreditGrantPanel";
import { searchUsersForCreditsAction, adjustUserCreditsAction, getUserCreditHistoryAction } from "./credit-actions";
import { BulkConfirmButton } from "@/components/admin/BulkConfirmButton";
import Link from "next/link";
import { approvePaymentAction, attachReceiptToStudentAction, checkAllPaymentsAction, checkPaymentAction, deletePaymentAction, dismissReceiptAction, ignoreSenderAction, markBillPaidAction, matchReceiptAction, previewReceiptForStudentAction, refundPaymentAction, rejectPaymentAction, undoRefundPaymentAction, cancelBillAction } from "./actions";
import { countUnmatchedReceipts, getPaymentPipelineHealth } from "@/lib/paymentPipelineStatus";
import { listUnmatchedReceipts } from "@/lib/paymentReceipts";
import { PaymentPipelineBanner } from "@/components/admin/PaymentPipelineBanner";
import { UnmatchedEmailList } from "@/components/admin/UnmatchedEmailList";
import { buttonVariants } from "@/components/ui/button";

const FILTERS: { label: string; value: PaymentFilterValue }[] = [
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

export default async function AdminPaymentsPage(
  props: { searchParams: Promise<{ status?: string; tab?: string; page?: string; user?: string; q?: string; id?: string }> }
) {
  const searchParams = await props.searchParams;
  if (searchParams.tab === "credits") return <CreditsTab />;
  if (searchParams.tab === "emails") return <EmailsTab />;
  // ?user= narrows the list to one person (every status), ?q= searches every page, ?id= opens the tab and page one payment is on.
  const view = readAdminPaymentsParams(searchParams);
  const filter = { userId: view.user ?? undefined, query: view.q ?? undefined };
  const located = view.id ? await locateAdminPayment(view.id, filter, view.statusGiven ? view.status : undefined) : null;
  const activeFilter: PaymentFilterValue = located && !view.statusGiven ? located.status : view.status;
  const [{ payments, total, page, pageCount }, health, unmatched, person] = await Promise.all([
    getAdminPayments(activeFilter === "ALL" ? undefined : activeFilter, located ? located.page : view.page, filter),
    getPaymentPipelineHealth(),
    countUnmatchedReceipts(),
    view.user ? prisma.user.findUnique({ where: { id: view.user }, select: { id: true, name: true, email: true } }) : null,
  ]);
  const session = await getServerAuthSession();
  const isOwner = isOwnerEmail(session?.user?.email);
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;
  const upcoming = isOwner ? await countUpcomingClasses(payments.filter((p) => p.status === "VERIFIED").map((p) => p.user.id)) : {};
  const hrefFor = (status: PaymentFilterValue, toPage = 1) => adminPaymentsHref({ status, page: toPage, user: view.user, q: view.q });

  return (
    <div>
      <h1 className="sr-only">Payments</h1>
      <TopTabs active="payments" unmatched={unmatched} />
      <PaymentPipelineBanner health={health} />
      {(person || view.q) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {person && (
            <p className="inline-flex flex-wrap items-center gap-2 rounded-full bg-neu-base px-3 py-1 text-small text-slate-300 shadow-raised-low">
              Showing
              <Link href={`/admin/users/${person.id}`} className="font-medium text-slate-50 underline underline-offset-4">
                {person.name ?? person.email}
              </Link>
              <span aria-hidden>·</span>
              <Link href={adminPaymentsHref({ q: view.q })} className="tap inline-flex items-center font-medium text-signal-fg">
                Clear
              </Link>
            </p>
          )}
          {view.q && (
            <p className="inline-flex flex-wrap items-center gap-2 rounded-full bg-neu-base px-3 py-1 text-small text-slate-300 shadow-raised-low">
              Search: <span className="font-medium text-slate-50">&ldquo;{view.q}&rdquo;</span>
              <span aria-hidden>·</span>
              <Link href={adminPaymentsHref({ user: view.user })} className="tap inline-flex items-center font-medium text-signal-fg">
                Clear
              </Link>
            </p>
          )}
        </div>
      )}
      {total > 0 && (
        <p className="mt-2 text-small text-slate-500">
          {total} payment{total === 1 ? "" : "s"} · {activeLabel.toLowerCase()}
          {pageCount > 1 ? ` · page ${page} of ${pageCount}` : ""}
        </p>
      )}

      <div className="mt-6">
        <AdminFilterTabs
          label="Payment status"
          mobile="scroll"
          items={FILTERS.map((filter) => ({
            label: filter.label,
            href: hrefFor(filter.value),
            active: activeFilter === filter.value,
          }))}
        />
      </div>

      {isOwner && (
        <a href="/api/admin/export?type=payments" className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-6" })}>
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
          onUndoRefund={isOwner ? undoRefundPaymentAction : undefined}
          onCancelBill={isOwner ? cancelBillAction : undefined}
          onMarkPaid={isOwner ? markBillPaidAction : undefined}
          canFix={isOwner}
          upcomingClasses={upcoming}
          highlightId={located?.id ?? null}
          listView={{ status: activeFilter, user: view.user, morePages: pageCount > 1 }}
          emptyMessage={
            activeFilter === "PENDING_REVIEW" ? "Nothing pending review." : `No ${activeLabel.toLowerCase()} payments.`
          }
        />
      </div>

      {pageCount > 1 && (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3 text-small">
          {page > 1 ? (
            <Link href={hrefFor(activeFilter, page - 1)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-slate-500">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={hrefFor(activeFilter, page + 1)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
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
      <h1 className="sr-only">Payments</h1>
      <TopTabs active="emails" unmatched={rows.length} />
      <PaymentPipelineBanner health={health} />
      <p className="mt-2 max-w-[70ch] text-small text-slate-500"><Hint>These emails arrived but matched no student by name and amount, so no payment was approved from them. Attach one to an open payment for the same amount, find the student when their bill is not open yet, or dismiss it if it is not a studio payment.</Hint></p>
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
              score: c.score,
              reasons: c.reasons,
            })),
            confidence: r.confidence,
          }))}
          onMatch={matchReceiptAction}
          onDismiss={dismissReceiptAction}
          onIgnoreSender={isOwner ? ignoreSenderAction : undefined}
          onFindStudents={isOwner ? searchUsersForCreditsAction : undefined}
          onPreviewStudent={isOwner ? previewReceiptForStudentAction : undefined}
          onAttachToStudent={isOwner ? attachReceiptToStudentAction : undefined}
        />
      </div>
    </div>
  );
}

async function CreditsTab() {
  const [initialUsers, recentAdjustments] = await Promise.all([searchUsersForCredits(""), getRecentCreditAdjustments(25)]);

  return (
    <div>
      <h1 className="sr-only">Payments</h1>
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
