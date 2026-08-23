"use client";

import { useState } from "react";
import Link from "next/link";
import type { ZellePaymentStatus } from "@prisma/client";
import {
  CREDIT_BASE_PRICE_CENTS,
  CREDIT_ORIGINAL_PRICE_CENTS,
  PRESET_BUNDLES,
  MIN_CUSTOM_QUANTITY,
  MAX_CUSTOM_QUANTITY,
  calculateClassCreditTotal,
} from "@/lib/classCreditPricing";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { createClassCreditsPendingPaymentAction, submitClassCreditsPaymentAction } from "./actions";

interface PendingPayment {
  id: string;
  status: ZellePaymentStatus;
  rejectionReason: string | null;
  amountCents: number;
}

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function ClassCreditPurchaseFlow({ zelleHandle }: { zelleHandle: string }) {
  const [selectedId, setSelectedId] = useState<string>(PRESET_BUNDLES[0].id);
  const [customQuantity, setCustomQuantity] = useState(4);
  const [acknowledged, setAcknowledged] = useState(false);
  const [payment, setPayment] = useState<PendingPayment | null>(null);
  const [loading, setLoading] = useState(false);

  const isCustom = selectedId === "custom";
  const quantity = isCustom ? customQuantity : (PRESET_BUNDLES.find((b) => b.id === selectedId)?.quantity ?? 1);
  const total = calculateClassCreditTotal(quantity);

  async function handleContinue() {
    setLoading(true);
    const result = await createClassCreditsPendingPaymentAction(quantity);
    setLoading(false);
    setPayment(result);
  }

  if (payment) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setPayment(null)}
          className="mb-4 text-xs text-slate-500 transition hover:text-slate-300"
        >
          ← Change quantity
        </button>
        <div className="mb-4 rounded-xl border border-ink/10 p-4">
          <p className="text-sm text-slate-100">
            {quantity} class credit{quantity > 1 ? "s" : ""}
          </p>
          {total.discountCents > 0 && (
            <p className="mt-1 text-xs text-emerald-400">{Math.round(total.discountRate * 100)}% bundle discount applied</p>
          )}
        </div>
        <ZelleUnlockGate
          status={payment.status}
          rejectionReason={payment.rejectionReason}
          scaleCode="Class Credits"
          scaleTitle={`${quantity} class credit${quantity > 1 ? "s" : ""}`}
          eyebrowLabel="Class Credits"
          amountCents={payment.amountCents}
          zelleHandle={zelleHandle}
          onSubmitPayment={submitClassCreditsPaymentAction.bind(null, payment.id)}
        />
      </div>
    );
  }

  return (
    <div className="glass-surface space-y-5 p-6">
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-400">Choose a bundle</p>
        <div className="grid grid-cols-2 gap-2">
          {PRESET_BUNDLES.map((bundle) => {
            const bundleTotal = calculateClassCreditTotal(bundle.quantity);
            const active = selectedId === bundle.id;
            return (
              <button
                key={bundle.id}
                type="button"
                onClick={() => setSelectedId(bundle.id)}
                className={`rounded-lg border px-3 py-2.5 text-left transition ${
                  active ? "border-[rgb(var(--c-a-400)/0.6)] bg-[rgb(var(--c-a-400)/0.1)]" : "border-ink/10 hover:border-ink/15"
                }`}
              >
                <p className={`text-sm font-medium ${active ? "text-[rgb(var(--c-a-200))]" : "text-slate-100"}`}>{bundle.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {bundle.quantity} credits · {formatUsd(bundleTotal.perCreditCents)}/credit
                </p>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSelectedId("custom")}
            className={`rounded-lg border px-3 py-2.5 text-left transition ${
              isCustom ? "border-[rgb(var(--c-a-400)/0.6)] bg-[rgb(var(--c-a-400)/0.1)]" : "border-ink/10 hover:border-ink/15"
            }`}
          >
            <p className={`text-sm font-medium ${isCustom ? "text-[rgb(var(--c-a-200))]" : "text-slate-100"}`}>Custom</p>
            <p className="mt-0.5 text-xs text-slate-500">Pick your own quantity</p>
          </button>
        </div>
      </div>

      {isCustom && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-400">How many credits?</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCustomQuantity((q) => Math.max(MIN_CUSTOM_QUANTITY, q - 1))}
              aria-label="Fewer credits"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink/10 text-lg text-slate-300 transition hover:border-ink/15"
            >
              −
            </button>
            <span className="w-10 text-center text-lg text-slate-100">{customQuantity}</span>
            <button
              type="button"
              onClick={() => setCustomQuantity((q) => Math.min(MAX_CUSTOM_QUANTITY, q + 1))}
              aria-label="More credits"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink/10 text-lg text-slate-300 transition hover:border-ink/15"
            >
              +
            </button>
            <span className="text-xs text-slate-500">
              {total.discountRate > 0 ? `${Math.round(total.discountRate * 100)}% off at this quantity` : "no discount below 4 credits"}
            </span>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-ink/10 p-4">
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            {quantity} × <span className="text-slate-600 line-through">{formatUsd(CREDIT_ORIGINAL_PRICE_CENTS)}</span>{" "}
            {formatUsd(CREDIT_BASE_PRICE_CENTS)}
          </span>
          <span>{formatUsd(total.subtotalCents)}</span>
        </div>
        {total.discountCents > 0 && (
          <div className="mt-1 flex items-center justify-between text-sm text-emerald-400">
            <span>Bundle discount ({Math.round(total.discountRate * 100)}%)</span>
            <span>−{formatUsd(total.discountCents)}</span>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between border-t border-ink/10 pt-2 text-base font-semibold text-slate-50">
          <span>Total</span>
          <span>{formatUsd(total.totalCents)}</span>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[rgb(var(--c-a-400)/0.2)] bg-[rgb(var(--c-a-400)/0.05)] p-3.5 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink/10 bg-slate-950 accent-[rgb(var(--c-a-400))]"
        />
        <span>
          I understand money spent on class credits is <span className="font-medium text-[rgb(var(--c-a-200))]">non-refundable</span>.
          The only way a credit comes back is canceling a booking 24+ hours before it starts. Inside that window,
          self-cancellation is off and any refund is a manual, case-by-case call. Full{" "}
          <Link href="/terms" target="_blank" className="text-[rgb(var(--c-a-300))] underline hover:text-[rgb(var(--c-a-200))]">
            terms &amp; refund policy
          </Link>
          .
        </span>
      </label>

      <button
        type="button"
        onClick={handleContinue}
        disabled={loading || !acknowledged}
        className="cta-sheen cta-fill w-full rounded-xl py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Loading…" : "Continue to payment"}
      </button>
    </div>
  );
}
