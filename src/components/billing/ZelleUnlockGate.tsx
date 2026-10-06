"use client";

import { useCallback, useEffect, useState } from "react";
import { getPaymentStatusAction } from "@/app/(dashboard)/billing/lessons/actions";
import { useRouter } from "next/navigation";
import type { ZellePaymentStatus } from "@prisma/client";
import { ZellePaymentModal } from "@/components/progression/ZellePaymentModal";
import type { ZelleReferenceSubmission } from "@/lib/payments";

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

  // A payment that was submitted and is waiting for review also clears by itself when the bank email arrives.
  useEffect(() => {
    if (status !== "PENDING_REVIEW") return;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      if ((await checkStatus().catch(() => null)) === "VERIFIED") router.refresh();
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [status, checkStatus, router]);

  async function handleSubmit(payload: ZelleReferenceSubmission) {
    await onSubmitPayment(payload);
    router.refresh();
  }

  if (status === "PENDING_REVIEW") {
    return (
      <div className="rounded-2xl border border-[rgb(var(--c-s-50)/0.2)] bg-[rgb(var(--c-s-50)/0.05)] p-6 text-center">
        <p className="text-small text-[rgb(var(--c-s-50)/0.8)]">
          Your payment confirmation is in. We&apos;re verifying it now.
        </p>
      </div>
    );
  }

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
        className="cta-sheen cta-fill w-full rounded-xl py-2.5 text-small font-semibold"
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
        onSubmit={handleSubmit}
        checkStatus={checkStatus}
        onVerified={() => router.refresh()}
      />
    </>
  );
}
