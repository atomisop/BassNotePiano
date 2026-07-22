"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PendingZellePayment } from "@/lib/payments";

export interface PaymentQueueProps {
  payments: PendingZellePayment[];
  onApprove: (paymentId: string) => Promise<void>;
  onReject: (paymentId: string, reason: string) => Promise<void>;
}

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function PaymentQueue({ payments, onApprove, onReject }: PaymentQueueProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      await onApprove(id);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    if (!reason.trim()) return;
    setBusyId(id);
    try {
      await onReject(id, reason.trim());
      router.refresh();
      setRejectingId(null);
      setReason("");
    } finally {
      setBusyId(null);
    }
  }

  if (payments.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8 text-center text-sm text-neutral-500">
        Nothing to review right now.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {payments.map((payment) => (
        <div key={payment.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">
                {payment.purpose === "PRO_LIFETIME" ? "Pro — Lifetime" : payment.scaleGroup?.code}
              </p>
              <h3 className="mt-1 font-serif text-lg text-neutral-50">
                {payment.purpose === "PRO_LIFETIME" ? "Full platform unlock" : payment.scaleGroup?.title}
              </h3>
              <p className="mt-1 text-sm text-neutral-500">{payment.user.name ?? payment.user.email}</p>
            </div>
            <p className="font-serif text-xl text-amber-300">{formatUsd(payment.amountCents)}</p>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-neutral-600">Sender name</dt>
              <dd className="text-neutral-300">{payment.senderName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-600">Reference code</dt>
              <dd className="font-mono text-neutral-300">{payment.referenceCode ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-600">Submitted</dt>
              <dd className="text-neutral-300">
                {payment.submittedAt ? new Date(payment.submittedAt).toLocaleString() : "—"}
              </dd>
            </div>
          </dl>

          {payment.note && <p className="mt-3 text-sm text-neutral-500">Note: {payment.note}</p>}

          {rejectingId === payment.id ? (
            <div className="mt-4 space-y-2">
              <textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why couldn't this be verified?"
                rows={2}
                className="w-full resize-none rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-red-400/60"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRejectingId(null);
                    setReason("");
                  }}
                  disabled={busyId === payment.id}
                  className="flex-1 rounded-lg border border-neutral-800 py-2 text-sm font-medium text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(payment.id)}
                  disabled={busyId === payment.id || !reason.trim()}
                  className="flex-1 rounded-lg bg-red-500/90 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === payment.id ? "Rejecting…" : "Confirm reject"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setRejectingId(payment.id)}
                disabled={busyId === payment.id}
                className="flex-1 rounded-lg border border-neutral-800 py-2 text-sm font-medium text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => handleApprove(payment.id)}
                disabled={busyId === payment.id}
                className="flex-1 rounded-lg bg-amber-400 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyId === payment.id ? "Approving…" : "Approve"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
