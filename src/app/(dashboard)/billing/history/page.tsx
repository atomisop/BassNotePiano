import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { getUserPaymentHistory } from "@/lib/payments";
import { calculateClassCreditTotal } from "@/lib/classCreditPricing";
import { ArrowLeftIcon } from "@/components/ui/icons";

const STATUS_LABEL: Record<string, string> = {
  AWAITING_TRANSFER: "Awaiting transfer",
  PENDING_REVIEW: "Pending review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

const STATUS_STYLE: Record<string, string> = {
  AWAITING_TRANSFER: "bg-slate-800 text-slate-400",
  PENDING_REVIEW: "bg-[rgb(var(--c-s-50)/0.15)] text-[rgb(var(--c-s-50))]",
  VERIFIED: "bg-emerald-400/15 text-emerald-300",
  REJECTED: "bg-red-400/15 text-red-300",
  EXPIRED: "bg-slate-800 text-slate-500",
};

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function describePayment(payment: {
  purpose: string;
  lessonQuantity: number | null;
  lessonType: string | null;
  scaleGroup: { code: string; title: string } | null;
}): { eyebrow: string; title: string } {
  if (payment.purpose === "CURRICULUM") {
    return { eyebrow: "Curriculum", title: "Full platform unlock" };
  }
  if (payment.purpose === "CLASS_CREDITS" && payment.lessonQuantity) {
    if (payment.lessonType) {
      const typeLabel = payment.lessonType === "ONLINE" ? "Online" : "In-Person";
      return {
        eyebrow: "Lesson credits (legacy)",
        title: `${payment.lessonQuantity} × ${typeLabel} lesson${payment.lessonQuantity === 1 ? "" : "s"}`,
      };
    }
    const { discountCents } = calculateClassCreditTotal(payment.lessonQuantity);
    return {
      eyebrow: "Class credits",
      title: `${payment.lessonQuantity} credit${payment.lessonQuantity === 1 ? "" : "s"}${discountCents > 0 ? " (bundle discount)" : ""}`,
    };
  }
  // Legacy Pay-As-You-Go row from before per-scale purchase was retired.
  return { eyebrow: payment.scaleGroup?.code ?? "Scale unlock", title: payment.scaleGroup?.title ?? "Scale unlock" };
}

export default async function BillingHistoryPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/history");

  const payments = await getUserPaymentHistory(session.user.id);

  return (
    <div className="w-full max-w-lg">
      <Link href="/account" className="mb-4 flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-100">
        <ArrowLeftIcon size={16} />
        Back to settings
      </Link>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Billing</p>
      <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Payment history</h1>
      <p className="mt-2 text-sm text-slate-500">
        {payments.length === 0
          ? "You haven't submitted any payments yet."
          : `${payments.length} payment${payments.length === 1 ? "" : "s"}.`}
      </p>

      {payments.length === 0 ? (
        <div className="mt-6 glass-surface p-8 text-center text-sm text-slate-500">
          Nothing here yet — buy the curriculum or a lesson package to see your payments listed here.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {payments.map((payment) => {
            const { eyebrow, title } = describePayment(payment);
            return (
            <div key={payment.id} className="glass-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">{eyebrow}</p>
                  <p className="mt-1 text-slate-100">{title}</p>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
