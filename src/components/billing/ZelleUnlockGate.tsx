"use client";

import { useState } from "react";
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
  onSubmitPayment,
}: ZelleUnlockGateProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(status === "AWAITING_TRANSFER" || status === "REJECTED");

  async function handleSubmit(payload: ZelleReferenceSubmission) {
    await onSubmitPayment(payload);
    router.refresh();
  }

  if (status === "PENDING_REVIEW") {
    return (
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6 text-center">
        <p className="text-sm text-amber-200/80">
          Your payment confirmation is in — we're verifying it now. You'll get access to{" "}
          <span className="text-amber-100">{scaleTitle}</span> as soon as it clears review.
        </p>
      </div>
    );
  }

  return (
    <>
      {status === "REJECTED" && (
        <div className="mb-4 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">
          Your last submission couldn&apos;t be verified{rejectionReason ? `: ${rejectionReason}` : "."} Double-check
          the reference code and try again.
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300"
      >
        {status === "REJECTED" ? "Resubmit payment" : "Pay with Zelle"}
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
      />
    </>
  );
}
