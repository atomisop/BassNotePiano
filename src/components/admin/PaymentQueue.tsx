"use client";

import { AdminListSearch, matchesQuery } from "@/components/admin/AdminListSearch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PendingZellePayment } from "@/lib/payments";
import { CREDITS_PER_CLASS, describePaymentPlan } from "@/lib/classCreditPricing";
import { formatDateTime } from "@/lib/classScheduleLabels";
import { MorphingSquare } from "@/components/ui/morphing-square";

export interface PaymentQueueProps {
  payments: PendingZellePayment[];
  onApprove: (paymentId: string) => Promise<void>;
  onReject: (paymentId: string, reason: string) => Promise<void>;
  onCheck?: (paymentId: string) => Promise<void>;
  emptyMessage?: string;
}

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function describePayment(payment: PendingZellePayment): { eyebrow: string; title: string } {
  if (payment.purpose === "CURRICULUM") {
    return { eyebrow: "Curriculum $69.99", title: "Full platform unlock" };
  }
  // The Schedule screen's guided extra-session flow: show the exact picked
  // time so the reviewing admin sees what this $35 is actually for, same
  // reason PAYMENT_PLAN_INSTALLMENT below shows its own cadence/term rather
  // than a bare credit count.
  if (payment.purpose === "CLASS_CREDITS" && payment.extraSessionScheduledAt) {
    return { eyebrow: "Extra class", title: formatDateTime(payment.extraSessionScheduledAt.toISOString()) };
  }
  if (payment.purpose === "CLASS_CREDITS" && payment.lessonQuantity) {
    // A lessonType present means this is a historical row from the old
    // 1:1 online/in-person lesson system, pre-dating the CLASS_CREDITS
    // rename — shown with its original wording rather than relabeled.
    if (payment.lessonType) {
      const typeLabel = payment.lessonType === "ONLINE" ? "Online" : "In-Person";
      return {
        eyebrow: "Lesson credits (legacy)",
        title: `${payment.lessonQuantity} × ${typeLabel} lesson${payment.lessonQuantity === 1 ? "" : "s"}`,
      };
    }
    // Extra classes: the row stores internal credits, a class is CREDITS_PER_CLASS of them.
    const classes = Math.max(1, Math.round(payment.lessonQuantity / CREDITS_PER_CLASS));
    return {
      eyebrow: "Extra classes",
      title: `${classes} extra class${classes === 1 ? "" : "es"}`,
    };
  }
  if (payment.purpose === "FAMILY_BUNDLE" && payment.lessonQuantity) {
    const recipientCount = payment.familyBundleRecipients.length;
    return {
      eyebrow: "Family bundle",
      title: `${payment.lessonQuantity} credit${payment.lessonQuantity === 1 ? "" : "s"} × ${recipientCount} account${recipientCount === 1 ? "" : "s"}`,
    };
  }
  if (payment.purpose === "CURRICULUM_FAMILY_BUNDLE") {
    const recipientCount = payment.familyBundleRecipients.length;
    return {
      eyebrow: "Curriculum family bundle",
      title: `Full curriculum × ${recipientCount} account${recipientCount === 1 ? "" : "s"}`,
    };
  }
  if (payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.paymentPlan) {
    return {
      eyebrow: describePaymentPlan(payment.paymentPlan.cadence, payment.paymentPlan.term),
      title: `Installment ${payment.installmentNumber ?? "?"} of ${payment.paymentPlan.termMonths}`,
    };
  }
  // Legacy Pay-As-You-Go row from before per-scale purchase was retired.
  return { eyebrow: payment.scaleGroup?.code ?? "Scale unlock", title: payment.scaleGroup?.title ?? "Scale unlock" };
}

const STATUS_LABEL: Record<string, string> = {
  AWAITING_TRANSFER: "Awaiting transfer",
  PENDING_REVIEW: "Pending review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

const STATUS_STYLE: Record<string, string> = {
  AWAITING_TRANSFER: "bg-neu-base shadow-pressed-low text-slate-400",
  PENDING_REVIEW: "bg-[rgb(var(--c-s-50)/0.15)] text-[rgb(var(--c-s-50))]",
  VERIFIED: "bg-slate-50/15 text-slate-100",
  REJECTED: "bg-red-400/15 text-red-300",
  EXPIRED: "bg-neu-base shadow-pressed-low text-slate-500",
};

export function PaymentQueue({
  payments,
  onApprove,
  onReject,
  onCheck,
  emptyMessage = "Nothing to review right now.",
}: PaymentQueueProps) {
  const [query, setQuery] = useState("");
  const shown = payments.filter((item) => matchesQuery(item, query));
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // Approve used to fire on a single click while Reject already required a
  // second confirming click plus a reason. That's backwards: the higher-
  // stakes action (this grants real product access/credits) was the easier one
  // to trigger by mistake in a list of several pending rows. Now mirrors
  // Reject's own two-step shape instead of a new, different pattern.
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      await onApprove(id);
      router.refresh();
      setApprovingId(null);
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
      <div className="glass-surface p-8 text-center text-small text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AdminListSearch value={query} onChange={setQuery} placeholder="Search name, email, reference code" shown={shown.length} total={payments.length} />
      {shown.length === 0 && <p className="text-small text-slate-400">Nothing matches that search.</p>}
      {shown.map((payment) => {
        const { eyebrow, title } = describePayment(payment);
        return (
        <div key={payment.id} className="glass-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">{eyebrow}</p>
              <h3 className="mt-1 text-body text-slate-50 font-semibold">{title}</h3>
              <p className="mt-1 text-small text-slate-500">{payment.user.name ?? payment.user.email}</p>
              {payment.purpose === "FAMILY_BUNDLE" && payment.familyBundleRecipients.length > 0 && (
                <p className="mt-1 text-small text-slate-600">
                  Credits go to: {payment.familyBundleRecipients.map((r) => r.user.name ?? r.user.email).join(", ")}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-body text-[rgb(var(--c-s-50))] font-semibold">{formatUsd(payment.amountCents)}</p>
              <span
                className={`mt-1 inline-block rounded-full px-2.5 py-1 text-small font-medium uppercase tracking-wide ${STATUS_STYLE[payment.status]}`}
              >
                {STATUS_LABEL[payment.status]}
              </span>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-small">
            <div>
              <dt className="text-small text-slate-600">{payment.method === "VENMO" ? "Venmo name" : "Zelle name"}</dt>
              <dd className="text-slate-300">{payment.senderName ?? "None"}</dd>
            </div>
            <div>
              <dt className="text-small text-slate-600">Paid with</dt>
              <dd className="text-slate-300">{payment.method === "VENMO" ? "Venmo" : "Zelle"}</dd>
            </div>
            <div>
              <dt className="text-small text-slate-600">Submitted</dt>
              <dd className="text-slate-300">
                {payment.submittedAt ? new Date(payment.submittedAt).toLocaleString() : "None"}
              </dd>
            </div>
          </dl>

          {payment.autoApproved && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-neu-base p-3 shadow-pressed-low">
              <p className="text-small text-slate-300">
                {payment.checkedAt ? "Auto-approved, checked" : "Auto-approved, check the transfer arrived"}
              </p>
              {!payment.checkedAt && onCheck && (
                <button
                  type="button"
                  disabled={busyId === payment.id}
                  onClick={async () => {
                    setBusyId(payment.id);
                    try {
                      await onCheck(payment.id);
                      router.refresh();
                    } finally {
                      setBusyId(null);
                    }
                  }}
                  className="tap shrink-0 rounded-lg px-3 py-1.5 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                >
                  Mark checked
                </button>
              )}
            </div>
          )}

          {payment.note && <p className="mt-3 text-small text-slate-500">Note: {payment.note}</p>}
          {payment.status === "REJECTED" && payment.rejectionReason && (
            <p className="mt-2 text-small text-red-400">Rejected: {payment.rejectionReason}</p>
          )}

          {payment.status !== "PENDING_REVIEW" ? null : rejectingId === payment.id ? (
            <div className="mt-4 space-y-2">
              <textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why couldn't this be verified?"
                rows={2}
                className="w-full resize-none glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-red-400/60"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRejectingId(null);
                    setReason("");
                  }}
                  disabled={busyId === payment.id}
                  className="tap flex-1 rounded-lg py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(payment.id)}
                  disabled={busyId === payment.id || !reason.trim()}
                  className="tap flex flex-1 items-center justify-center rounded-lg bg-red-500/95 py-2 text-small font-semibold text-slate-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === payment.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                  {busyId === payment.id ? "Rejecting…" : "Confirm reject"}
                </button>
              </div>
            </div>
          ) : approvingId === payment.id ? (
            // Same two-step shape as reject, just without a reason field:
            // there's nothing to explain for an approval, only something to
            // double-check before it fires.
            <div className="mt-4 space-y-2">
              <p className="text-small text-slate-400">
                Approve {formatUsd(payment.amountCents)} for {payment.user.name ?? payment.user.email}?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setApprovingId(null)}
                  disabled={busyId === payment.id}
                  className="tap flex-1 rounded-lg py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleApprove(payment.id)}
                  disabled={busyId === payment.id}
                  className="tap cta-sheen cta-fill flex flex-1 items-center justify-center rounded-lg py-2 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyId === payment.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                  {busyId === payment.id ? "Approving…" : "Confirm approve"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setRejectingId(payment.id)}
                disabled={busyId === payment.id}
                className="tap flex-1 rounded-lg py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => setApprovingId(payment.id)}
                disabled={busyId === payment.id}
                className="tap cta-sheen cta-fill flex-1 rounded-lg py-2 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                Approve
              </button>
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}
