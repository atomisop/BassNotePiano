"use client";

import { useEffect, useState } from "react";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { openAtomWithCase } from "@/lib/atomTrigger";
import { describePaymentWait } from "@/lib/paymentWait";
import { askAboutPaymentAction, getPaymentWaitInfoAction } from "@/app/(dashboard)/billing/paymentWaitActions";

/** What happens while a payment is waiting to clear: how long, what we will do, and a way to ask. */
export function PaymentWaitNotice({ paymentId, submittedAt: initial = null, compact = false }: { paymentId: string; submittedAt?: string | null; compact?: boolean }) {
  const [submittedAt, setSubmittedAt] = useState<string | null>(initial);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    getPaymentWaitInfoAction(paymentId)
      .then((info) => {
        if (!cancelled && info?.submittedAt) setSubmittedAt(info.submittedAt);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [paymentId, initial]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const notice = describePaymentWait(submittedAt ? new Date(submittedAt) : null, now);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const result = await askAboutPaymentAction(paymentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      openAtomWithCase(result.escalationId);
    } catch {
      setError("That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "mt-3 rounded-xl bg-neu-base px-4 py-3 shadow-pressed-low" : "rounded-2xl border border-[rgb(var(--c-s-50)/0.2)] bg-neu-base shadow-pressed-low p-6 text-center"}>
      <p className={compact ? "text-small font-medium text-slate-100" : "text-small font-medium text-[rgb(var(--c-s-50))]"}>{notice.headline}</p>
      <p className={`mt-1 text-small ${compact ? "text-slate-400" : "text-slate-300"}`}>{notice.detail}</p>
      <button
        type="button"
        onClick={ask}
        disabled={busy}
        className={`tap mt-3 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-small font-medium text-slate-100 transition disabled:opacity-60 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low ${
          notice.slow ? "ring-1 ring-[rgb(var(--signal)/0.5)]" : ""
        }`}
      >
        {busy && <MorphingSquare size={12} className="shrink-0" />}
        Message us about this payment
      </button>
      {error && (
        <p role="alert" className="mt-2 text-small text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
