"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ZellePaymentModal } from "@/components/progression/ZellePaymentModal";
import { getPaymentStatusAction } from "@/app/(dashboard)/billing/lessons/actions";
import { precheckReceiptAction } from "@/app/(dashboard)/billing/receipt-actions";
import { buttonVariants } from "@/components/ui/button";
import { announceChange } from "@/lib/liveEvents";
import type { ZelleReferenceSubmission } from "@/lib/payments";
import { submitHistoryPaymentAction } from "./actions";

/**
 * Pay (an unpaid bill) or Resubmit (a rejected one) right on Payment history: the same payment sheet as everywhere else, opened
 * in place. A link with ?pay=<id> (the "Payment rejected" notice) opens it by itself.
 */
export function HistoryPayButton({
  paymentId,
  rejected,
  amountCents,
  title,
  eyebrow,
  zelleHandle,
  autoOpen = false,
  hero = false,
}: {
  paymentId: string;
  rejected: boolean;
  amountCents: number;
  title: string;
  eyebrow: string;
  zelleHandle: string;
  autoOpen?: boolean;
  /** On the band's sheet at the top of the page: the screen's one big button, carrying the amount. Looks only. */
  hero?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const checkStatus = useCallback(() => getPaymentStatusAction(paymentId), [paymentId]);

  async function submit(payload: ZelleReferenceSubmission) {
    await submitHistoryPaymentAction(paymentId, payload);
    announceChange("payments");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonVariants({ variant: "primary", size: hero ? "lg" : "sm", className: hero ? "w-full tabular-nums" : "mt-3" })}
      >
        {rejected ? (hero ? "Resubmit payment" : "Resubmit") : hero ? `Pay ${(amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}` : "Pay"}
      </button>
      <ZellePaymentModal
        isOpen={open}
        onClose={() => setOpen(false)}
        scaleCode={eyebrow}
        scaleTitle={title}
        eyebrowLabel={rejected ? "Resubmit" : "Payment"}
        amountCents={amountCents}
        zelleHandle={zelleHandle}
        paymentId={paymentId}
        onSubmit={submit}
        onPrecheck={(base64, mimeType) => precheckReceiptAction(paymentId, base64, mimeType)}
        checkStatus={checkStatus}
        onVerified={() => {
          announceChange("payments");
          router.refresh();
        }}
      />
    </>
  );
}
