import { redirect } from "next/navigation";
import Link from "next/link";
import type { PaymentPlanCadence, PaymentPlanTerm } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { getUserPaymentHistory } from "@/lib/payments";
import { CREDITS_PER_CLASS, describePaymentPlan } from "@/lib/classCreditPricing";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { PaymentWaitNotice } from "@/components/billing/PaymentWaitNotice";

const STATUS_LABEL: Record<string, string> = {
  AWAITING_TRANSFER: "Awaiting transfer",
  PENDING_REVIEW: "Pending review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

const STATUS_STYLE: Record<string, string> = {
  AWAITING_TRANSFER: "bg-neu-base shadow-pressed-low text-slate-400",
  PENDING_REVIEW: "bg-[rgb(var(--c-s-50)/0.15)] text-[rgb(var(--c-s-50))]",
  VERIFIED: "bg-slate-50/15 text-slate-100",
  REJECTED: "bg-red-400/15 text-red-300",
  EXPIRED: "bg-neu-base shadow-pressed-low text-slate-500",
};

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function describePayment(payment: {
  purpose: string;
  lessonQuantity: number | null;
  lessonType: string | null;
  installmentNumber: number | null;
  scaleGroup: { code: string; title: string } | null;
  paymentPlan: { cadence: PaymentPlanCadence; term: PaymentPlanTerm; termMonths: number } | null;
}): { eyebrow: string; title: string } {
  if (payment.purpose === "CURRICULUM") {
    return { eyebrow: "Curriculum", title: "Full platform unlock" };
  }
  if (payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.paymentPlan) {
    return {
      eyebrow: describePaymentPlan(payment.paymentPlan.cadence, payment.paymentPlan.term),
      title: `Installment ${payment.installmentNumber ?? "?"} of ${payment.paymentPlan.termMonths}`,
    };
  }
  if (payment.purpose === "CLASS_CREDITS" && payment.lessonQuantity) {
    if (payment.lessonType) {
      const typeLabel = payment.lessonType === "ONLINE" ? "Online" : "In-Person";
      return {
        eyebrow: "Lesson credits (legacy)",
        title: `${payment.lessonQuantity} × ${typeLabel} lesson${payment.lessonQuantity === 1 ? "" : "s"}`,
      };
    }
    // Extra classes: the row stores internal credits, a class is CREDITS_PER_CLASS of them.
    const classes = Math.max(1, Math.round(payment.lessonQuantity / CREDITS_PER_CLASS));
    return {
      eyebrow: "Extra classes",
      title: `${classes} extra class${classes === 1 ? "" : "es"}`,
    };
  }
  // Legacy Pay-As-You-Go row from before per-scale purchase was retired.
  return { eyebrow: payment.scaleGroup?.code ?? "Scale unlock", title: payment.scaleGroup?.title ?? "Scale unlock" };
}

export const metadata = { title: "Billing history" };

export default async function BillingHistoryPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/history");

  const payments = await getUserPaymentHistory(session.user.id);

  return (
    <div>
      <Link href="/account" className="tap w-fit mb-4 flex items-center gap-1.5 text-small text-slate-400 transition hover:text-slate-100">
        <ArrowLeftIcon size={16} />
        Back to settings
      </Link>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Billing</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Payment history</h1>

      {payments.length === 0 ? (
        <div className="mt-6 glass-surface p-8 text-center text-small text-slate-500">
          No payments yet.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {payments.map((payment) => {
            const { eyebrow, title } = describePayment(payment);
            return (
            <div key={payment.id} className="glass-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">{eyebrow}</p>
                  <p className="mt-1 text-slate-100">{title}</p>
                  <p className="mt-1 text-small text-slate-600">
                    {new Date(payment.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-body text-slate-50 font-semibold">{formatUsd(payment.amountCents)}</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2.5 py-1 text-small font-medium uppercase tracking-wide ${STATUS_STYLE[payment.status]}`}
                  >
                    {STATUS_LABEL[payment.status]}
                  </span>
                </div>
              </div>

              {payment.status === "PENDING_REVIEW" && (
                <PaymentWaitNotice paymentId={payment.id} submittedAt={payment.submittedAt ? new Date(payment.submittedAt).toISOString() : null} compact />
              )}
              {payment.referenceCode && (
                <p className="mt-3 font-mono text-small text-slate-500">Ref: {payment.referenceCode}</p>
              )}
              {payment.status === "REJECTED" && payment.rejectionReason && (
                <p className="mt-2 text-small text-red-400">Reason: {payment.rejectionReason}</p>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
