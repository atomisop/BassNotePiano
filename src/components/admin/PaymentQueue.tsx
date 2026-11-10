"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";
import { AdminListSearch, matchesQuery } from "@/components/admin/AdminListSearch";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PendingZellePayment } from "@/lib/payments";
import { CREDITS_PER_CLASS, describePaymentPlan } from "@/lib/classCreditPricing";
import { formatDateTime } from "@/lib/classScheduleLabels";
import { formatPhone } from "@/lib/phone";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { EmptyState } from "@/components/ui/EmptyState";
import { CheckCheck } from "@/components/ui/appIcons";
import { buttonVariants } from "@/components/ui/button";
import { BulkBar, RowCheck } from "@/components/admin/BulkBar";
import { toast } from "@/components/ui/Toaster";
import { ViewMore } from "@/components/ui/ViewMore";
import { StatusDot } from "@/components/ui/StatusDot";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { CardFoot, Callout, Meta } from "@/components/ui/CardKit";
import { InlineConfirm } from "@/components/admin/InlineConfirm";

export interface PaymentQueueProps {
  payments: PendingZellePayment[];
  onApprove: (paymentId: string, notify?: boolean) => Promise<void>;
  onReject: (paymentId: string, reason: string, notify?: boolean) => Promise<void>;
  onCheck?: (paymentId: string) => Promise<void>;
  /** Owner only. Marks a verified payment refunded, optionally taking back its credits and ending its plan. */
  onRefund?: (paymentId: string, note: string, removeCredits: boolean, cancelPlan: boolean, notify?: boolean) => Promise<{ ok: boolean; error: string | null; warning?: string | null }>;
  /** Owner only. Permanently removes the payment record. */
  onDelete?: (paymentId: string) => Promise<void>;
  /** Owner only: put a refunded payment back as paid. */
  onUndoRefund?: (paymentId: string, restoreCredits: boolean, reactivatePlan: boolean, notify?: boolean) => Promise<{ ok: boolean; error: string | null; warning?: string | null }>;
  /** Owner only: close a bill nobody paid, keeping the record as expired. */
  onCancelBill?: (paymentId: string) => Promise<{ ok: boolean; error: string | null }>;
  emptyMessage?: string;
}

/** How a bank email found this payment. The sure ways are a quiet word in the meta line; the softer ones are the card's one callout. */
const MATCHED_VIA_LABEL: Record<string, string> = {
  code: "Matched by code",
  name: "Matched by name",
  codeTypo: "Matched by a payment code one character off. Check it is the right person.",
  phone: "Matched by phone number. Check it is the right person.",
  amount: "Matched by the exact amount only (nobody else had it open). Check it is the right person.",
};

const SOFT_MATCH = new Set(["amount", "phone", "codeTypo"]);

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function describePayment(payment: PendingZellePayment): { eyebrow: string; title: string } {
  if (payment.purpose === "CURRICULUM") {
    return { eyebrow: "Curriculum (retired)", title: "Full platform unlock" };
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
    // rename, shown with its original wording rather than relabeled.
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
      title: `${creditsLabelFromStored(payment.lessonQuantity)} × ${recipientCount} account${recipientCount === 1 ? "" : "s"}`,
    };
  }
  if (payment.purpose === "CURRICULUM_FAMILY_BUNDLE") {
    const recipientCount = payment.familyBundleRecipients.length;
    return {
      eyebrow: "Curriculum family bundle",
      title: `Full curriculum × ${recipientCount} account${recipientCount === 1 ? "" : "s"}`,
    };
  }
  if (payment.purpose === "FAMILY_PLAN_INSTALLMENT") {
    return { eyebrow: "Group plan", title: "Combined 28-day bill" };
  }
  if (payment.purpose === "FAMILY_PLAN_START") {
    return { eyebrow: "Family plan", title: "Combined first payment for the whole family" };
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
  REFUNDED: "Refunded",
};

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  AWAITING_TRANSFER: "neutral",
  PENDING_REVIEW: "warning",
  VERIFIED: "success",
  REJECTED: "danger",
  EXPIRED: "neutral",
  REFUNDED: "neutral",
};

/** The quiet everyday button, used for Back / Keep in the confirm steps. */
const QUIET = buttonVariants({ variant: "secondary", className: "flex-1" });

export function PaymentQueue({
  payments,
  onApprove,
  onReject,
  onCheck,
  onDelete,
  onRefund,
  onUndoRefund,
  onCancelBill,
  emptyMessage = "Nothing to review right now.",
}: PaymentQueueProps) {
  const [query, setQuery] = useState("");
  // On by default here: a student who paid is waiting for the answer (and the receipt).
  const [notify, setNotify] = useNotifyStudent("payments", true);
  const shown = payments.filter((item) => matchesQuery(item, query));
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  // Only what is waiting on you can be ticked: payments to approve, and auto-approved ones not yet checked.
  const canTick = (p: PendingZellePayment) => p.status === "PENDING_REVIEW" || (!!onCheck && p.autoApproved && !p.checkedAt);
  const pickedList = [...picked].filter((id) => payments.some((p) => p.id === id));
  const pickedPending = pickedList.filter((id) => payments.find((p) => p.id === id)?.status === "PENDING_REVIEW");
  const pickedUnchecked = pickedList.filter((id) => { const p = payments.find((x) => x.id === id); return !!p && p.autoApproved && !p.checkedAt; });
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // Approve used to fire on a single click while Reject already required a
  // second confirming click plus a reason. That's backwards: the higher-
  // stakes action (this grants real product access/credits) was the easier one
  // to trigger by mistake in a list of several pending rows. Now mirrors
  // Reject's own two-step shape instead of a new, different pattern.
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoCredits, setUndoCredits] = useState(true);
  const [undoPlan, setUndoPlan] = useState(true);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [refundNote, setRefundNote] = useState("");
  const [refundCredits, setRefundCredits] = useState(true);
  const [refundPlan, setRefundPlan] = useState(true);
  const [refundError, setRefundError] = useState<string | null>(null);
  // A status is news only when the list mixes them: on a tab filtered to one status (Pending, Verified...) the tab already says it.
  const mixedStatuses = new Set(payments.map((p) => p.status)).size > 1;

  /** Opens one confirm step on a payment and closes any other, so a card never shows two at once. */
  function openStep(step: "approve" | "reject" | "refund" | "undo" | "cancel" | "delete", id: string) {
    setApprovingId(step === "approve" ? id : null);
    setRejectingId(step === "reject" ? id : null);
    setRefundingId(step === "refund" ? id : null);
    setUndoingId(step === "undo" ? id : null);
    setCancelingId(step === "cancel" ? id : null);
    setDeletingId(step === "delete" ? id : null);
    if (step === "refund") setRefundError(null);
  }

  /** "Jordan Alemu, $55.00": who and how much, for the toast, so the admin can tell which row it was. */
  function whoAndHow(id: string): string | undefined {
    const p = payments.find((x) => x.id === id);
    return p ? `${p.user.name ?? p.user.email}, ${formatUsd(p.amountCents)}` : undefined;
  }

  function failureText(err: unknown): string {
    return err instanceof Error && err.message ? err.message : "It did not go through. Try again.";
  }

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      const h = await toast.held("Approving payment", () => onApprove(id, notify), { mail: notify });
      if (h.undone) return;
      toast.success("Payment approved", { description: whoAndHow(id) });
      router.refresh();
      setApprovingId(null);
    } catch (err) {
      toast.error("Couldn't approve that payment", { description: failureText(err), action: { label: "Retry", onClick: () => void handleApprove(id) } });
    } finally {
      setBusyId(null);
    }
  }

  async function handleRefund(id: string) {
    if (!onRefund || !refundNote.trim()) return;
    setBusyId(id);
    setRefundError(null);
    try {
      const h = await toast.held("Refunding payment", () => onRefund(id, refundNote.trim(), refundCredits, refundPlan, notify), { mail: notify });
      if (h.undone) return;
      const result = h.value;
      if (!result.ok) {
        setRefundError(result.error);
        toast.error("Couldn't refund that payment", { description: result.error ?? undefined });
        return;
      }
      setRefundingId(null);
      setRefundNote("");
      router.refresh();
      // The refund went through but part of it could not be done; the panel is gone after a refresh, so say so now,
      // and keep the toast up until it is dismissed.
      if (result.warning) toast.warning("Refunded, with a note", { description: result.warning, duration: null });
      else toast.success("Payment refunded", { description: whoAndHow(id) });
    } catch (err) {
      toast.error("Couldn't refund that payment", { description: failureText(err) });
    } finally {
      setBusyId(null);
    }
  }

  async function handleUndoRefund(id: string) {
    if (!onUndoRefund) return;
    setBusyId(id);
    try {
      const h = await toast.held("Undoing the refund", () => onUndoRefund(id, undoCredits, undoPlan, notify), { mail: notify });
      if (h.undone) return;
      const result = h.value;
      if (!result.ok) return void toast.warning(result.error ?? "Could not undo the refund.");
      toast.success("Refund undone, the payment counts as paid again", result.warning ? { description: result.warning, duration: null } : undefined);
      setUndoingId(null);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancelBill(id: string) {
    if (!onCancelBill) return;
    setBusyId(id);
    try {
      const h = await toast.held("Canceling the bill", () => onCancelBill(id));
      if (h.undone) return;
      const result = h.value;
      if (!result.ok) return void toast.warning(result.error ?? "Could not cancel the bill.");
      toast.success("Bill canceled");
      setCancelingId(null);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!onDelete) return;
    setBusyId(id);
    try {
      const h = await toast.held("Deleting payment record", () => onDelete(id));
      if (h.undone) return;
      toast.success("Payment record deleted", { description: whoAndHow(id) });
      router.refresh();
      setDeletingId(null);
    } catch (err) {
      toast.error("Couldn't delete that payment", { description: failureText(err) });
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    if (!reason.trim()) return;
    setBusyId(id);
    try {
      const h = await toast.held("Rejecting payment", () => onReject(id, reason.trim(), notify), { mail: notify });
      if (h.undone) return;
      toast.success("Payment rejected", { description: whoAndHow(id) });
      router.refresh();
      setRejectingId(null);
      setReason("");
    } catch (err) {
      toast.error("Couldn't reject that payment", { description: failureText(err) });
    } finally {
      setBusyId(null);
    }
  }

  if (payments.length === 0) {
    return (
      <EmptyState icon={<CheckCheck />} title={emptyMessage.replace(/\.$/, "")} description="New payments show up here as soon as they come in." />
    );
  }

  return (
    <div className="space-y-3">
      <AdminListSearch value={query} onChange={setQuery} placeholder="Search name, email, reference code" shown={shown.length} total={payments.length} />
      <NotifyToggle on={notify} onChange={setNotify} label="Notify the student" />
      {shown.length === 0 && <p className="text-small text-slate-400">Nothing matches that search.</p>}
      {shown.filter(canTick).length > 1 && (
        <label className="tap flex items-center gap-2 text-small text-slate-400">
          <input
            type="checkbox"
            className="h-4 w-4 accent-signal"
            checked={shown.filter(canTick).every((p) => picked.has(p.id))}
            onChange={(e) => setPicked(e.target.checked ? new Set(shown.filter(canTick).map((p) => p.id)) : new Set())}
          />
          Select all {shown.filter(canTick).length} waiting on you
        </label>
      )}
      <BulkBar
        ids={pickedList}
        onClear={() => setPicked(new Set())}
        onDone={(ok) => {
          setPicked((prev) => new Set([...prev].filter((id) => !ok.includes(id))));
          router.refresh();
        }}
        actions={[
          ...(pickedPending.length === pickedList.length && pickedList.length > 0
            ? [{ label: "Approve selected", question: `Approve ${pickedList.length} payment${pickedList.length === 1 ? "" : "s"}? Each one grants its credits or starts its plan right away.`, confirmLabel: "Yes, approve", run: (id: string) => onApprove(id, notify) }]
            : []),
          ...(onCheck && pickedUnchecked.length === pickedList.length && pickedList.length > 0
            ? [{ label: "Mark selected checked", run: (id: string) => onCheck(id) }]
            : []),
        ]}
        extra={pickedList.length > 0 && pickedPending.length !== pickedList.length && pickedUnchecked.length !== pickedList.length ? <span className="text-small text-slate-500">Pick only one kind to act on them together.</span> : null}
      />
      <ViewMore items={shown} initial={8} animateRemovals>
      {(payment) => {
        const { eyebrow, title } = describePayment(payment);
        const name = payment.user.name ?? payment.user.email;
        const busy = busyId === payment.id;
        const softMatch = !!payment.matchedVia && SOFT_MATCH.has(payment.matchedVia);
        const needsCheck = payment.autoApproved && !payment.checkedAt;
        const step =
          rejectingId === payment.id ? "reject"
          : approvingId === payment.id ? "approve"
          : refundingId === payment.id ? "refund"
          : undoingId === payment.id ? "undo"
          : cancelingId === payment.id ? "cancel"
          : deletingId === payment.id ? "delete"
          : null;
        // The rare tools live in one "More" menu, the destructive ones last and in red; each opens its own confirm under the card.
        const canRefund = !!onRefund && payment.status === "VERIFIED";
        const canUndo = !!onUndoRefund && payment.status === "REFUNDED";
        const canCancelBill = !!onCancelBill && (payment.status === "AWAITING_TRANSFER" || payment.status === "REJECTED");
        const hasMenu = canRefund || canUndo || canCancelBill || !!onDelete;
        const pending = payment.status === "PENDING_REVIEW";
        const hasFoot = pending || payment.status === "VERIFIED" || hasMenu;
        return (
        // A row that leaves the list (approved, rejected or deleted, once the page refreshes) folds away in 200ms instead of vanishing,
        // so the rows below slide up into its place rather than jump. A row that stays (its status just changed) does not move.
        <motion.div
          key={payment.id}
          exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, overflow: "hidden" }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          className="rounded-card bg-neu-base p-4 shadow-raised-mid md:p-5"
        >
          {/* The focal point: who paid and how much. What it was for is one quieter line, how it arrived one quieter still. */}
          <div className="flex items-start gap-1">
            {canTick(payment) && (
              <div className="-ml-2 -mt-1.5">
                <RowCheck checked={picked.has(payment.id)} onChange={(on) => toggle(payment.id, on)} label={`Select ${name}`} />
              </div>
            )}
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-title font-semibold text-slate-50">
                  <Link href={`/admin/users/${payment.user.id}`} className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {name}
                  </Link>
                </h2>
                <p className="mt-0.5 truncate text-small text-slate-400">{title === name ? eyebrow : `${eyebrow} · ${title}`}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-headline font-semibold tabular-nums text-slate-50">{formatUsd(payment.amountCents)}</p>
                {mixedStatuses && (
                  <StatusDot tone={STATUS_TONE[payment.status]} className="mt-1">
                    {STATUS_LABEL[payment.status]}
                  </StatusDot>
                )}
              </div>
            </div>
          </div>

          <Meta
            className="mt-3 tabular-nums"
            items={[
              payment.method === "VENMO" ? "Venmo" : "Zelle",
              payment.senderName,
              payment.senderPhone ? formatPhone(payment.senderPhone) : null,
              payment.submittedAt ? new Date(payment.submittedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null,
              payment.matchedVia && !softMatch ? (MATCHED_VIA_LABEL[payment.matchedVia] ?? `Matched by ${payment.matchedVia}`) : null,
              payment.autoApproved && payment.checkedAt ? "Auto-approved, checked" : null,
            ]}
          />
          {payment.purpose === "FAMILY_BUNDLE" && payment.familyBundleRecipients.length > 0 && (
            <p className="mt-1 text-small text-slate-500">To: {payment.familyBundleRecipients.map((r) => r.user.name ?? r.user.email).join(", ")}</p>
          )}
          {payment.note && <p className="mt-2 text-small text-slate-400">&ldquo;{payment.note}&rdquo;</p>}

          {/* At most one problem per card: an auto-approval to check and a soft match share the one strip. */}
          {(needsCheck || softMatch) && (
            <Callout
              tone="warning"
              className="mt-3"
              action={
                needsCheck && onCheck ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusyId(payment.id);
                      try {
                        await onCheck(payment.id);
                        router.refresh();
                      } finally {
                        setBusyId(null);
                      }
                    }}
                    className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0" })}
                  >
                    {busy && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                    Mark checked
                  </button>
                ) : undefined
              }
            >
              {needsCheck && <p>Auto-approved. Check the transfer arrived.</p>}
              {softMatch && <p className={needsCheck ? "mt-1 opacity-80" : undefined}>{MATCHED_VIA_LABEL[payment.matchedVia!]}</p>}
            </Callout>
          )}

          {payment.status === "REJECTED" && payment.rejectionReason && (
            <Callout tone="neutral" className="mt-3">Rejected: {payment.rejectionReason}</Callout>
          )}

          {step === "reject" ? (
            <div className="mt-4 space-y-2 border-t border-slate-50/8 pt-3">
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
                  disabled={busy}
                  className={QUIET}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(payment.id)}
                  disabled={busy || !reason.trim()}
                  className={buttonVariants({ variant: "danger", className: "flex-1" })}
                >
                  {busy && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                  {busy ? "Rejecting…" : "Confirm reject"}
                </button>
              </div>
            </div>
          ) : step === "approve" ? (
            // Same two-step shape as reject, just without a reason field:
            // there's nothing to explain for an approval, only something to
            // double-check before it fires.
            <div className="mt-4 space-y-2 border-t border-slate-50/8 pt-3">
              <p className="text-small text-slate-300">
                Approve {formatUsd(payment.amountCents)} for {name}?
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setApprovingId(null)} disabled={busy} className={QUIET}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleApprove(payment.id)}
                  disabled={busy}
                  className={buttonVariants({ variant: "primary", className: "flex-1" })}
                >
                  {busy && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                  {busy ? "Approving…" : "Confirm approve"}
                </button>
              </div>
            </div>
          ) : step === "refund" ? (
            <div className="mt-4 space-y-3 border-t border-slate-50/8 pt-3">
              <p className="text-small text-slate-300">
                Mark {formatUsd(payment.amountCents)} as refunded. Send the money back yourself on Zelle or Venmo.
              </p>
              <input
                value={refundNote}
                onChange={(e) => setRefundNote(e.target.value)}
                placeholder="Reason"
                maxLength={200}
                className="w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60"
              />
              <label className="flex items-center gap-2 text-small text-slate-300">
                <input type="checkbox" checked={refundCredits} onChange={(e) => setRefundCredits(e.target.checked)} className="h-4 w-4 accent-slate-50" />
                Take back the credits it gave
              </label>
              {payment.paymentPlanId && (
                <label className="flex items-center gap-2 text-small text-slate-300">
                  <input type="checkbox" checked={refundPlan} onChange={(e) => setRefundPlan(e.target.checked)} className="h-4 w-4 accent-slate-50" />
                  Cancel the plan too
                </label>
              )}
              {refundError && <p className="text-small text-red-400">{refundError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setRefundingId(null)} disabled={busy} className={QUIET}>
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => handleRefund(payment.id)}
                  disabled={busy || !refundNote.trim()}
                  className={buttonVariants({ variant: "danger", className: "flex-1" })}
                >
                  {busy && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                  {busy ? "Refunding…" : "Mark refunded"}
                </button>
              </div>
            </div>
          ) : step === "undo" ? (
            <div className="mt-4 space-y-3 border-t border-slate-50/8 pt-3">
              <p className="text-small text-slate-300">Count {formatUsd(payment.amountCents)} as paid again. Choose what else to put back.</p>
              <label className="flex items-center gap-2 text-small text-slate-200">
                <input type="checkbox" checked={undoCredits} onChange={(e) => setUndoCredits(e.target.checked)} className="h-4 w-4 accent-signal" />
                Give back the credits the refund took
              </label>
              <label className="flex items-center gap-2 text-small text-slate-200">
                <input type="checkbox" checked={undoPlan} onChange={(e) => setUndoPlan(e.target.checked)} className="h-4 w-4 accent-signal" />
                Run the plan again if the refund ended it (canceled classes are not brought back)
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setUndoingId(null)} disabled={busy} className={QUIET}>
                  Keep refunded
                </button>
                <button type="button" onClick={() => handleUndoRefund(payment.id)} disabled={busy} className={buttonVariants({ variant: "primary", className: "flex-1" })}>
                  {busy ? "Undoing…" : "Undo refund"}
                </button>
              </div>
            </div>
          ) : step === "cancel" ? (
            <InlineConfirm
              className="mt-4"
              danger
              question="Close this unpaid bill?"
              detail="The record stays as expired. The plan is not changed."
              confirmLabel="Cancel bill"
              busyLabel="Closing…"
              busy={busy}
              onCancel={() => setCancelingId(null)}
              onConfirm={() => void handleCancelBill(payment.id)}
            />
          ) : step === "delete" ? (
            <InlineConfirm
              className="mt-4"
              danger
              question="Delete this payment record for good?"
              detail="It does not undo any plan, credits or classes it already gave."
              confirmLabel="Delete payment"
              busyLabel="Deleting…"
              busy={busy}
              onCancel={() => setDeletingId(null)}
              onConfirm={() => void handleDelete(payment.id)}
            />
          ) : hasFoot ? (
            // One primary (Approve) on a payment waiting for you, Reject quiet beside it, everything rare in More.
            <CardFoot>
              {hasMenu && (
                <ActionMenu label="More" align={pending ? "left" : "right"} className={pending ? "mr-auto" : undefined}>
                  {canUndo && (
                    <button type="button" onClick={() => openStep("undo", payment.id)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                      Undo refund
                    </button>
                  )}
                  {canRefund && (
                    <button type="button" onClick={() => openStep("refund", payment.id)} className={buttonVariants({ variant: "ghost", size: "sm", className: "text-red-300 hover:text-red-200" })}>
                      Refund
                    </button>
                  )}
                  {canCancelBill && (
                    <button type="button" onClick={() => openStep("cancel", payment.id)} className={buttonVariants({ variant: "ghost", size: "sm", className: "text-red-300 hover:text-red-200" })}>
                      Cancel bill
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => openStep("delete", payment.id)}
                      disabled={busy}
                      className={buttonVariants({ variant: "ghost", size: "sm", className: "text-red-300 hover:text-red-200" })}
                    >
                      Delete
                    </button>
                  )}
                </ActionMenu>
              )}
              {payment.status === "VERIFIED" && (
                <Link href={`/billing/receipt/${payment.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Receipt
                </Link>
              )}
              {pending && (
                <>
                  <button type="button" onClick={() => openStep("reject", payment.id)} disabled={busy} className={buttonVariants({ variant: "secondary" })}>
                    Reject
                  </button>
                  <button type="button" onClick={() => openStep("approve", payment.id)} disabled={busy} className={buttonVariants({ variant: "primary" })}>
                    Approve
                  </button>
                </>
              )}
            </CardFoot>
          ) : null}
        </motion.div>
        );
      }}
      </ViewMore>
    </div>
  );
}
