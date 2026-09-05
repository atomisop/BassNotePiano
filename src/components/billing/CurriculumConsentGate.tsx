"use client";

import { useState } from "react";
import Link from "next/link";
import { ZelleUnlockGate, type ZelleUnlockGateProps } from "./ZelleUnlockGate";

/**
 * Wraps ZelleUnlockGate with a required "no refunds" acknowledgment for the
 * one purchase in the app where that's an absolute, no-exceptions rule (the
 * $69.99 curriculum) — mirrors the inline checkbox on the class-credits
 * purchase flow, just pulled out since curriculum has no quantity-picker
 * step to attach it to.
 */
export function CurriculumConsentGate(props: ZelleUnlockGateProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (acknowledged) return <ZelleUnlockGate {...props} />;

  return (
    <div className="glass-surface space-y-4 p-6">
      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[rgb(var(--c-s-50)/0.2)] bg-[rgb(var(--c-s-50)/0.05)] p-3.5 text-xs text-slate-300">
        <input
          type="checkbox"
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink/10 bg-slate-950 accent-[rgb(var(--c-s-50))]"
        />
        <span>
          I understand the ${(props.amountCents / 100).toFixed(2)} curriculum purchase is{" "}
          <span className="font-medium text-[rgb(var(--c-s-50))]">final and non-refundable</span> once bought, since access is
          granted right away, for good. Full{" "}
          <Link href="/terms" target="_blank" className="text-[rgb(var(--c-s-50))] underline hover:opacity-70">
            terms &amp; refund policy
          </Link>
          .
        </span>
      </label>
    </div>
  );
}
