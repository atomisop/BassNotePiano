import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getUserPaymentHistory } from "@/lib/payments";

const STATUS_LABEL: Record<string, string> = {
  AWAITING_TRANSFER: "Awaiting transfer",
  PENDING_REVIEW: "Pending review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

const STATUS_STYLE: Record<string, string> = {
  AWAITING_TRANSFER: "bg-slate-800 text-slate-400",
  PENDING_REVIEW: "bg-amber-400/15 text-amber-300",
  VERIFIED: "bg-emerald-400/15 text-emerald-300",
  REJECTED: "bg-red-400/15 text-red-300",
  EXPIRED: "bg-slate-800 text-slate-500",
};

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default async function BillingHistoryPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/history");

  const payments = await getUserPaymentHistory(session.user.id);

  return (
    <div className="w-full max-w-lg">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Billing</p>
      <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Payment history</h1>
      <p className="mt-2 text-sm text-slate-500">
        {payments.length === 0
          ? "You haven't submitted any payments yet."
          : `${payments.length} payment${payments.length === 1 ? "" : "s"}.`}
      </p>

      {payments.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-sm text-slate-500">
          Nothing here yet — unlock a scale or go Pro to see your payments listed here.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {payments.map((payment) => (
            <div key={payment.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-amber-400/80">
                    {payment.purpose === "PRO_LIFETIME" ? "Pro — Lifetime" : payment.scaleGroup?.code}
                  </p>
                  <p className="mt-1 text-slate-100">
                    {payment.purpose === "PRO_LIFETIME" ? "Full platform unlock" : payment.scaleGroup?.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {new Date(payment.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-serif text-lg text-slate-50">{formatUsd(payment.amountCents)}</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${STATUS_STYLE[payment.status]}`}
                  >
                    {STATUS_LABEL[payment.status]}
                  </span>
                </div>
              </div>

              {payment.referenceCode && (
                <p className="mt-3 font-mono text-xs text-slate-500">Ref: {payment.referenceCode}</p>
              )}
              {payment.status === "REJECTED" && payment.rejectionReason && (
                <p className="mt-2 text-xs text-red-400">Reason: {payment.rejectionReason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
