"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PendingZellePayment } from "@/lib/payments";

export interface PaymentQueueProps {
  payments: PendingZellePayment[];
  onApprove: (paymentId: string) => Promise<void>;
  onReject: (paymentId: string, reason: string) => Promise<void>;
  emptyMessage?: string;
}

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const STATUS_LABEL: Record<string, string> = {
  AWAITING_TRANSFER: "Awaiting transfer",
  PENDING_REVIEW: "Pending review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

const STATUS_STYLE: Record<string, string> = {
  AWAITING_TRANSFER: "bg-slate-800 text-slate-400",
  PENDING_REVIEW: "bg-amber-400/15 text-amber-300",
  VERIFIED: "bg-emerald-400/15 text-emerald-300",
  REJECTED: "bg-red-400/15 text-red-300",
  EXPIRED: "bg-slate-800 text-slate-500",
};

export function PaymentQueue({
  payments,
  onApprove,
  onReject,
  emptyMessage = "Nothing to review right now.",
}: PaymentQueueProps) {
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
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {payments.map((payment) => (
        <div key={payment.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">
                {payment.purpose === "PRO_LIFETIME" ? "Pro — Lifetime" : payment.scaleGroup?.code}
              </p>
              <h3 className="mt-1 font-serif text-lg text-slate-50">
                {payment.purpose === "PRO_LIFETIME" ? "Full platform unlock" : payment.scaleGroup?.title}
              </h3>
              <p className="mt-1 text-sm text-slate-500">{payment.user.name ?? payment.user.email}</p>
            </div>
            <div className="text-right">
              <p className="font-serif text-xl text-amber-300">{formatUsd(payment.amountCents)}</p>
              <span
                className={`mt-1 inline-block rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${STATUS_STYLE[payment.status]}`}
              >
                {STATUS_LABEL[payment.status]}
              </span>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-600">Sender name</dt>
              <dd className="text-slate-300">{payment.senderName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Reference code</dt>
              <dd className="font-mono text-slate-300">{payment.referenceCode ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Submitted</dt>
              <dd className="text-slate-300">
                {payment.submittedAt ? new Date(payment.submittedAt).toLocaleString() : "—"}
              </dd>
            </div>
          </dl>

          {payment.note && <p className="mt-3 text-sm text-slate-500">Note: {payment.note}</p>}
          {payment.status === "REJECTED" && payment.rejectionReason && (
            <p className="mt-2 text-sm text-red-400">Rejected: {payment.rejectionReason}</p>
          )}

          {payment.status !== "PENDING_REVIEW" ? null : rejectingId === payment.id ? (
            <div className="mt-4 space-y-2">
              <textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why couldn't this be verified?"
                rows={2}
                className="w-full resize-none rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-red-400/60"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRejectingId(null);
                    setReason("");
                  }}
                  disabled={busyId === payment.id}
                  className="flex-1 rounded-lg border border-slate-800 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(payment.id)}
                  disabled={busyId === payment.id || !reason.trim()}
                  className="flex-1 rounded-lg bg-red-500/90 py-2 text-sm font-semibold text-slate-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
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
                className="flex-1 rounded-lg border border-slate-800 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => handleApprove(payment.id)}
                disabled={busyId === payment.id}
                className="flex-1 rounded-lg bg-amber-400 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
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
