"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { ZellePaymentStatus } from "@prisma/client";
import { CLASS_MINUTES, EXTRA_CLASS_PRICE_CENTS, MAX_EXTRA_CLASSES_PER_PURCHASE } from "@/lib/classCreditPricing";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { NumberTicker } from "@/components/ui/number-ticker";
import { createExtraClassesPaymentAction, submitClassCreditsPaymentAction } from "../lessons/actions";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function totalMinutesLabel(classes: number) {
  const minutes = classes * CLASS_MINUTES;
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours} hr ${rest} min`;
}

const QUICK_PICKS = [1, 2, 4];
const classWord = (n: number) => `class${n === 1 ? "" : "es"}`;

interface PendingPayment {
  id: string;
  status: ZellePaymentStatus;
  amountCents: number;
  quantity: number;
}

export function BuyCreditsFlow({ zelleHandle }: { zelleHandle: string }) {
  const [quantity, setQuantity] = useState(2);
  const [payment, setPayment] = useState<PendingPayment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = quantity * EXTRA_CLASS_PRICE_CENTS;
  const clamp = (n: number) => Math.min(MAX_EXTRA_CLASSES_PER_PURCHASE, Math.max(1, n));

  async function handleContinue() {
    setLoading(true);
    setError(null);
    const result = await createExtraClassesPaymentAction(quantity);
    setLoading(false);
    if (!result.ok || !result.id || !result.status || result.amountCents === null) {
      setError(result.error ?? "Something went wrong. Please try again.");
      return;
    }
    setPayment({ id: result.id, status: result.status as ZellePaymentStatus, amountCents: result.amountCents, quantity });
  }

  if (payment) {
    return (
      <div>
        <p className="mb-4 text-small text-slate-400">
          {payment.quantity} extra {classWord(payment.quantity)} · {totalMinutesLabel(payment.quantity)} of class time
        </p>
        <ZelleUnlockGate
          status={payment.status}
          rejectionReason={null}
          scaleCode="Extra classes"
          scaleTitle={`${payment.quantity} ${classWord(payment.quantity)}`}
          eyebrowLabel="Extra sessions"
          amountCents={payment.amountCents}
          zelleHandle={zelleHandle}
          onSubmitPayment={submitClassCreditsPaymentAction.bind(null, payment.id)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-small font-medium text-slate-400">How many extra classes?</p>
        <p className="mt-0.5 text-small text-slate-500">{formatUsd(EXTRA_CLASS_PRICE_CENTS)} each, {CLASS_MINUTES} minutes.</p>

        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setQuantity((q) => clamp(q - 1))}
            disabled={quantity <= 1}
            aria-label="One fewer class"
            className="tap flex h-12 w-12 items-center justify-center rounded-full bg-neu-base text-slate-200 shadow-raised-low transition active:shadow-pressed-low disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minus className="h-5 w-5" strokeWidth={2} />
          </button>
          <div className="min-w-24 text-center" aria-live="polite">
            <p className="font-hero text-hero font-bold text-slate-50">
              <NumberTicker value={quantity} />
            </p>
            <p className="text-small text-slate-500">{classWord(quantity)}</p>
          </div>
          <button
            type="button"
            onClick={() => setQuantity((q) => clamp(q + 1))}
            disabled={quantity >= MAX_EXTRA_CLASSES_PER_PURCHASE}
            aria-label="One more class"
            className="tap flex h-12 w-12 items-center justify-center rounded-full bg-neu-base text-slate-200 shadow-raised-low transition active:shadow-pressed-low disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        <div className="mt-4 flex justify-center gap-2">
          {QUICK_PICKS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setQuantity(n)}
              aria-pressed={quantity === n}
              className={`tap rounded-full px-4 py-2 text-small font-medium transition bg-neu-base ${
                quantity === n ? "text-signal shadow-pressed-low" : "text-slate-300 shadow-raised-low hover:shadow-raised-mid"
              }`}
            >
              {n} {classWord(n)}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-neu-base p-4 shadow-pressed-low">
        <div className="flex items-center justify-between text-small text-slate-400">
          <span>
            <NumberTicker value={quantity} /> × {formatUsd(EXTRA_CLASS_PRICE_CENTS)}
          </span>
          <span>{totalMinutesLabel(quantity)} of class time</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-ink/10 pt-2 text-body font-semibold text-slate-50">
          <span>Total</span>
          <NumberTicker value={total} format={formatUsd} />
        </div>
      </div>

      {error && <p className="text-small text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleContinue}
        disabled={loading}
        className="cta-sheen cta-fill flex min-h-11 w-full items-center justify-center rounded-xl py-2.5 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <MorphingSquare size={14} className="mr-2 shrink-0" />}
        {loading ? "One moment…" : "Continue to payment"}
      </button>
    </div>
  );
}
