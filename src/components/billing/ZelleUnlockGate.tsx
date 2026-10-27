"use client";

import { useCallback, useEffect, useState } from "react";
import { getPaymentStatusAction } from "@/app/(dashboard)/billing/lessons/actions";
import { useRouter } from "next/navigation";
import type { ZellePaymentStatus } from "@prisma/client";
import { ZellePaymentModal } from "@/components/progression/ZellePaymentModal";
import type { ZelleReferenceSubmission } from "@/lib/payments";
import { PaymentWaitNotice } from "@/components/billing/PaymentWaitNotice";
import { buttonVariants } from "@/components/ui/button";
import { announceChange } from "@/lib/liveEvents";
import { precheckReceiptAction } from "@/app/(dashboard)/billing/receipt-actions";

export interface ZelleUnlockGateProps {
  status: ZellePaymentStatus;
  rejectionReason: string | null;
  scaleCode: string;
  scaleTitle: string;
  eyebrowLabel: string;
  amountCents: number;
  zelleHandle: string;
  /** Lets the screen notice the payment clearing on its own. */
  paymentId: string;
  onSubmitPayment: (payload: ZelleReferenceSubmission) => Promise<void>;
}

export function ZelleUnlockGate({
  status,
  rejectionReason,
  scaleCode,
  scaleTitle,
  eyebrowLabel,
  amountCents,
  zelleHandle,
  paymentId,
  onSubmitPayment,
}: ZelleUnlockGateProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(status === "AWAITING_TRANSFER" || status === "REJECTED");

  const checkStatus = useCallback(() => getPaymentStatusAction(paymentId), [paymentId]);

  // The pay screen shows the real state of the payment, whatever happens elsewhere: the bank email can clear it while the
  // person is still in their banking app, or an admin can approve it. It is checked every few seconds while the tab is in view
  // and the moment they come back to it, so a payment that went through never keeps showing the old unpaid amount (and nobody
  // pays twice). A change, to anything, refreshes the page and the counters.
  useEffect(() => {
    let alive = true;
    async function check() {
      if (document.visibilityState !== "visible") return;
      const now = await checkStatus().catch(() => null);
      if (alive && now && now !== status) {
        announceChange("payments");
        router.refresh();
      }
    }
    const timer = window.setInterval(check, 8_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [status, checkStatus, router]);

  async function handleSubmit(payload: ZelleReferenceSubmission) {
    await onSubmitPayment(payload);
    announceChange("payments");
    router.refresh();
  }

  if (status === "PENDING_REVIEW") return <PaymentWaitNotice paymentId={paymentId} />;

  return (
    <>
      {status === "REJECTED" && (
        <div className="mb-4 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-small text-red-300">
          Your last submission couldn&apos;t be verified{rejectionReason ? `: ${rejectionReason}` : "."} Double-check
          the reference code and try again.
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={buttonVariants({ variant: "primary", className: "w-full" })}
      >
        {status === "REJECTED" ? "Resubmit payment" : "Pay"}
      </button>

      <ZellePaymentModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        scaleCode={scaleCode}
        scaleTitle={scaleTitle}
        eyebrowLabel={eyebrowLabel}
        amountCents={amountCents}
        zelleHandle={zelleHandle}
        paymentId={paymentId}
        onSubmit={handleSubmit}
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
