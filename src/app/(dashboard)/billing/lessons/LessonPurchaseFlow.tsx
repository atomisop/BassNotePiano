"use client";

import { useState } from "react";
import type { LessonType, ZellePaymentStatus } from "@prisma/client";
import { LESSON_PRICE_CENTS, calculateLessonTotal } from "@/lib/lessonPricing";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { createLessonPendingPaymentAction, submitLessonPaymentAction } from "./actions";

interface PendingPayment {
  id: string;
  status: ZellePaymentStatus;
  rejectionReason: string | null;
  amountCents: number;
}

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function LessonPurchaseFlow({ zelleHandle }: { zelleHandle: string }) {
  const [quantity, setQuantity] = useState(1);
  const [type, setType] = useState<LessonType>("ONLINE");
  const [payment, setPayment] = useState<PendingPayment | null>(null);
  const [loading, setLoading] = useState(false);

  const total = calculateLessonTotal(quantity);

  async function handleContinue() {
    setLoading(true);
    const result = await createLessonPendingPaymentAction(quantity, type);
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
        <div className="mb-4 rounded-xl border border-white/10 p-4">
          <p className="text-sm text-slate-100">
            {quantity} × {type === "ONLINE" ? "Online" : "In-Person"} lesson{quantity > 1 ? "s" : ""}
          </p>
          {total.discountCents > 0 && <p className="mt-1 text-xs text-emerald-400">20% bundle discount applied</p>}
        </div>
        <ZelleUnlockGate
          status={payment.status}
          rejectionReason={payment.rejectionReason}
          scaleCode="Lessons"
          scaleTitle={`${quantity} × ${type === "ONLINE" ? "online" : "in-person"} lesson${quantity > 1 ? "s" : ""}`}
          eyebrowLabel="Lesson Credits"
          amountCents={payment.amountCents}
          zelleHandle={zelleHandle}
          onSubmitPayment={submitLessonPaymentAction.bind(null, payment.id)}
        />
      </div>
    );
  }

  return (
    <div className="glass-surface space-y-5 p-6">
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-400">Lesson type</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType("ONLINE")}
            className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
              type === "ONLINE"
                ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
                : "border-white/10 text-slate-400 hover:border-white/20"
            }`}
          >
            Online
          </button>
          <button
            type="button"
            onClick={() => setType("IN_PERSON")}
            className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
              type === "IN_PERSON"
                ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
                : "border-white/10 text-slate-400 hover:border-white/20"
            }`}
          >
            In-Person
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-400">How many 30-minute sessions?</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            aria-label="Fewer sessions"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-lg text-slate-300 transition hover:border-white/20"
          >
            −
          </button>
          <span className="w-8 text-center text-lg text-slate-100">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(20, q + 1))}
            aria-label="More sessions"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-lg text-slate-300 transition hover:border-white/20"
          >
            +
          </button>
        </div>
        {quantity === 1 && <p className="mt-1.5 text-xs text-slate-600">Book 2 or more and save 20% on the whole order.</p>}
      </div>

      <div className="rounded-xl border border-white/10 p-4">
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            {quantity} × {formatUsd(LESSON_PRICE_CENTS)}
          </span>
          <span>{formatUsd(total.subtotalCents)}</span>
        </div>
        {total.discountCents > 0 && (
          <div className="mt-1 flex items-center justify-between text-sm text-emerald-400">
            <span>Bundle discount (20%)</span>
            <span>−{formatUsd(total.discountCents)}</span>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-base font-semibold text-slate-50">
          <span>Total</span>
          <span>{formatUsd(total.totalCents)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleContinue}
        disabled={loading}
        className="cta-sheen w-full rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Loading…" : "Continue to payment"}
      </button>
    </div>
  );
}
