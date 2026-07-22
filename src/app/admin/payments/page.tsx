import { getPendingZellePayments } from "@/lib/payments";
import { PaymentQueue } from "@/components/admin/PaymentQueue";
import { approvePaymentAction, rejectPaymentAction } from "./actions";

export default async function AdminPaymentsPage() {
  const payments = await getPendingZellePayments();

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-neutral-50">Payment verification queue</h1>
      <p className="mt-2 text-sm text-neutral-500">
        {payments.length === 0
          ? "Nothing pending review."
          : `${payments.length} payment${payments.length === 1 ? "" : "s"} awaiting review.`}
      </p>

      <div className="mt-8">
        <PaymentQueue payments={payments} onApprove={approvePaymentAction} onReject={rejectPaymentAction} />
      </div>
    </div>
  );
}
