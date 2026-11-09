"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";
import { AdminListSearch, matchesQuery } from "@/components/admin/AdminListSearch";

import { useEffect, useState } from "react";
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
import { Hint } from "@/components/ui/Hint";
import { AdminEditPaymentButton } from "@/components/admin/AdminEditPaymentButton";
import { adminPaymentsHref, type PaymentFilterValue } from "@/lib/adminPaymentLinks";
import { newIdempotencyKey } from "@/lib/idempotencyClient";

export interface PaymentQueueProps {
  payments: PendingZellePayment[];
  onApprove: (paymentId: string, notify?: boolean) => Promise<void>;
  onReject: (paymentId: string, reason: string, notify?: boolean) => Promise<void>;
  onCheck?: (paymentId: string) => Promise<void>;
  /** Owner only. Marks a verified payment refunded, optionally taking back its credits, ending its plan and canceling their upcoming classes. */
  onRefund?: (paymentId: string, note: string, removeCredits: boolean, cancelPlan: boolean, notify?: boolean, cancelClasses?: boolean) => Promise<{ ok: boolean; error: string | null; warning?: string | null }>;
  /** Owner only. Permanently removes the payment record. */
  onDelete?: (paymentId: string) => Promise<void>;
  /** Owner only: put a refunded payment back as paid. */
  onUndoRefund?: (paymentId: string, restoreCredits: boolean, reactivatePlan: boolean, notify?: boolean) => Promise<{ ok: boolean; error: string | null; warning?: string | null }>;
  /** Owner only: close a bill nobody paid, keeping the record as expired. */
  onCancelBill?: (paymentId: string) => Promise<{ ok: boolean; error: string | null }>;
  /** Owner only: the money for an unpaid bill came another way (cash, an email that never arrived). Records it and approves it. */
  onMarkPaid?: (paymentId: string, notify?: boolean, key?: string) => Promise<{ ok: boolean; error: string | null }>;
  /** Owner only: correct an approved payment's amount or day (Fix). */
  canFix?: boolean;
  /** Each person's classes booked from now on, for the refund panel's "also cancel their classes". */
  upcomingClasses?: Record<string, number>;
  /** A link to one payment: it is marked and scrolled to. */
  highlightId?: string | null;
  /** On the person's own page: their name is not a link and the list starts shorter. */
  personView?: boolean;
  /** Billing > Payments: the view the page shows, so a search can reach every page, not only the one loaded. */
  listView?: { status: PaymentFilterValue; user: string | null; morePages: boolean };
  emptyMessage?: string;
}

const MATCHED_VIA_LABEL: Record<string, string> = {
  code: "the payment code in the note",
  name: "the sender's name",
  codeTypo: "a payment code with a typo that is one character from this payment's (please check it is the right person)",
  phone: "the phone number (please check it is the right person)",
  amount: "the exact amount only: nobody else had this amount open (please check it is the right person)",
};

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

const STATUS_STYLE: Record<string, string> = {
  AWAITING_TRANSFER: "bg-neu-base shadow-pressed-low text-slate-400",
  PENDING_REVIEW: "bg-slate-50/15 text-slate-50",
  VERIFIED: "bg-slate-50/15 text-slate-100",
  REJECTED: "bg-red-400/15 text-red-300",
  EXPIRED: "bg-neu-base shadow-pressed-low text-slate-500",
  REFUNDED: "bg-amber-400/15 text-amber-300",
};

export function PaymentQueue({
  payments,
  onApprove,
  onReject,
  onCheck,
  onDelete,
  onRefund,
  onUndoRefund,
  onCancelBill,
  onMarkPaid,
  canFix = false,
  upcomingClasses = {},
  highlightId = null,
  personView = false,
  listView,
  emptyMessage = "Nothing to review right now.",
}: PaymentQueueProps) {
  const [query, setQuery] = useState("");
  // On by default here: a student who paid is waiting for the answer (and the receipt). On the person's own page the one switch at the
  // top of the page (student-changes) decides, so this list draws no switch of its own there.
  // A payment result is something the student is waiting for, so it defaults to telling them here too (the student page's own
  // switch defaults off). The person view shows its own switch so the choice is visible where the button is.
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
  const [refundClasses, setRefundClasses] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  // One key per attempt: a double tap on "Yes, mark paid" records the money once.
  const [markKey, setMarkKey] = useState(() => newIdempotencyKey());
  // A link to one payment opens with it marked, on screen.
  useEffect(() => {
    if (!highlightId) return;
    const t = window.setTimeout(() => document.getElementById(`pay-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    return () => window.clearTimeout(t);
  }, [highlightId]);

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
      const h = await toast.held("Refunding payment", () => onRefund(id, refundNote.trim(), refundCredits, refundPlan, notify, refundClasses), { mail: notify });
      if (h.undone) return;
      const result = h.value;
      if (!result.ok) {
        setRefundError(result.error);
        toast.error("Couldn't refund that payment", { description: result.error ?? undefined });
        return;
      }
      setRefundingId(null);
      setRefundNote("");
      setRefundClasses(false);
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

  async function handleMarkPaid(id: string) {
    if (!onMarkPaid) return;
    setBusyId(id);
    try {
      const h = await toast.held("Marking the bill paid", () => onMarkPaid(id, notify, markKey), { mail: notify });
      if (h.undone) return;
      const result = h.value;
      if (!result.ok) return void toast.warning(result.error ?? "Could not mark the bill paid.");
      toast.success("Marked paid", { description: whoAndHow(id) });
      setMarkingId(null);
      setMarkKey(newIdempotencyKey());
      router.refresh();
    } catch (err) {
      toast.error("Couldn't mark that bill paid", { description: failureText(err) });
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
      <EmptyState icon={<CheckCheck />} title={emptyMessage.replace(/\.$/, "")} description={personView ? "Their bills and payments show up here." : "New payments show up here as soon as they come in."} />
    );
  }

  const firstShown = personView ? 4 : 8;
  const highlightAt = highlightId ? shown.findIndex((p) => p.id === highlightId) : -1;

  return (
    <div className="space-y-3">
      {(!personView || payments.length > firstShown) && (
        <AdminListSearch value={query} onChange={setQuery} placeholder="Search name, email, reference code" shown={shown.length} total={payments.length} />
      )}
      {listView?.morePages && query.trim() && (
        // The box above only searches this page; this one searches every payment.
        <Link href={adminPaymentsHref({ status: listView.status, user: listView.user, q: query.trim() })} className="tap -mt-2 inline-flex items-center text-small font-medium text-signal-fg underline underline-offset-4">
          Search every page for &ldquo;{query.trim()}&rdquo;
        </Link>
      )}
      <NotifyToggle on={notify} onChange={setNotify} label={personView ? "Tell them about payment results" : "Notify the student"} />
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
      <ViewMore key={highlightId ?? "list"} items={shown} initial={Math.max(firstShown, highlightAt + 1)} animateRemovals>
      {(payment) => {
        const { eyebrow, title } = describePayment(payment);
        return (
        // A row that leaves the list (approved, rejected or deleted, once the page refreshes) folds away in 200ms instead of vanishing,
        // so the rows below slide up into its place rather than jump. A row that stays (its status just changed) does not move.
        <motion.div
          key={payment.id}
          exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, overflow: "hidden" }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          id={`pay-${payment.id}`}
          className={`glass-surface scroll-mt-28 p-4 ${highlightId === payment.id ? "ring-2 ring-signal" : ""}`}
        >
          {/* Who and how much: bold. How it arrived: one gray line. */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              {canTick(payment) && <RowCheck checked={picked.has(payment.id)} onChange={(on) => toggle(payment.id, on)} label={`Select ${payment.user.name ?? payment.user.email}`} />}
              <div className="min-w-0">
                <h2 className="truncate text-title font-semibold text-slate-50">
                  {personView ? (
                    payment.user.name ?? payment.user.email
                  ) : (
                    <Link href={`/admin/users/${payment.user.id}`} className="hover:underline hover:underline-offset-4">
                      {payment.user.name ?? payment.user.email}
                    </Link>
                  )}
                </h2>
                <p className="mt-0.5 truncate text-small text-slate-500">{title === (payment.user.name ?? payment.user.email) ? eyebrow : `${eyebrow} · ${title}`}</p>
                {payment.purpose === "FAMILY_BUNDLE" && payment.familyBundleRecipients.length > 0 && (
                  <p className="mt-0.5 text-caption text-slate-500">To: {payment.familyBundleRecipients.map((r) => r.user.name ?? r.user.email).join(", ")}</p>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-headline font-semibold tabular-nums text-slate-50">{formatUsd(payment.amountCents)}</p>
              <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-caption font-medium uppercase tracking-wide ${STATUS_STYLE[payment.status]}`}>
                {STATUS_LABEL[payment.status]}
              </span>
            </div>
          </div>

          <p className="mt-3 text-small tabular-nums text-slate-500">
            {[
              payment.method === "VENMO" ? "Venmo" : "Zelle",
              payment.senderName,
              payment.senderPhone ? formatPhone(payment.senderPhone) : null,
              payment.submittedAt ? new Date(payment.submittedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {payment.matchedVia && (
            <p className={`mt-1 text-small ${payment.matchedVia === "amount" || payment.matchedVia === "phone" || payment.matchedVia === "codeTypo" ? "font-medium text-amber-300" : "text-slate-500"}`}>
              Matched by {MATCHED_VIA_LABEL[payment.matchedVia] ?? payment.matchedVia}
            </p>
          )}

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
                  className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0" })}
                >
                  {busyId === payment.id && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                  Mark checked
                </button>
              )}
            </div>
          )}

          {payment.note && <p className="mt-2 text-small text-slate-500">&ldquo;{payment.note}&rdquo;</p>}
          {payment.status === "REJECTED" && payment.rejectionReason && (
            <p className="mt-2 text-small text-red-400">{payment.rejectionReason}</p>
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
                  className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(payment.id)}
                  disabled={busyId === payment.id || !reason.trim()}
                  className="tap flex flex-1 items-center justify-center rounded-full bg-red-500/95 py-2 text-small font-semibold text-slate-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 shadow-raised-low active:shadow-pressed-low hover:shadow-raised-mid"
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
                  className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleApprove(payment.id)}
                  disabled={busyId === payment.id}
                  className={buttonVariants({ variant: "primary", className: "flex-1" })}
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
                className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => setApprovingId(payment.id)}
                disabled={busyId === payment.id}
                className={buttonVariants({ variant: "primary", className: "flex-1" })}
              >
                Approve
              </button>
            </div>
          )}

          {payment.status === "VERIFIED" && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link href={`/billing/receipt/${payment.id}`} className="tap inline-flex items-center text-small font-medium text-signal-fg hover:underline">
                Receipt
              </Link>
              {canFix && <AdminEditPaymentButton paymentId={payment.id} amountCents={payment.amountCents} paidAt={payment.reviewedAt ?? payment.updatedAt} />}
            </div>
          )}

          {onRefund && payment.status === "VERIFIED" && (
            <div className="mt-4 border-t border-slate-50/10 pt-3">
              {refundingId === payment.id ? (
                <div className="space-y-3">
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
                  {(() => {
                    // Canceled before the credits are taken back, so the credits those classes held come back too.
                    const group = payment.purpose === "FAMILY_PLAN_INSTALLMENT" || payment.purpose === "FAMILY_PLAN_START";
                    const count = upcomingClasses[payment.user.id] ?? 0;
                    if (!group && count === 0) return null;
                    return (
                      <div className="flex items-center gap-1.5">
                        <label className="flex items-center gap-2 text-small text-slate-300">
                          <input type="checkbox" checked={refundClasses} onChange={(e) => setRefundClasses(e.target.checked)} className="h-4 w-4 accent-slate-50" />
                          {group ? "Also cancel everyone's upcoming classes on it" : `Also cancel their ${count} upcoming class${count === 1 ? "" : "es"}`}
                        </label>
                        <Hint>Canceled first, so the credits those classes held come back too.</Hint>
                      </div>
                    );
                  })()}
                  {refundError && <p className="text-small text-red-400">{refundError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRefundingId(null)}
                      disabled={busyId === payment.id}
                      className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRefund(payment.id)}
                      disabled={busyId === payment.id || !refundNote.trim()}
                      className="tap flex flex-1 items-center justify-center rounded-lg bg-amber-500/95 py-2 text-small font-semibold text-slate-950 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyId === payment.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                      {busyId === payment.id ? "Refunding…" : "Mark refunded"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRefundError(null);
                    setRefundClasses(false);
                    setRefundingId(payment.id);
                  }}
                  className="tap inline-flex items-center text-small font-medium text-slate-400 transition hover:text-amber-300"
                >
                  Refund
                </button>
              )}
            </div>
          )}

          {onUndoRefund && payment.status === "REFUNDED" && (
            <div className="mt-4 border-t border-slate-50/10 pt-3">
              {undoingId === payment.id ? (
                <div className="space-y-3">
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
                    <button type="button" onClick={() => setUndoingId(null)} disabled={busyId === payment.id} className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low">Keep refunded</button>
                    <button type="button" onClick={() => handleUndoRefund(payment.id)} disabled={busyId === payment.id} className={buttonVariants({ variant: "primary", className: "flex-1" })}>
                      {busyId === payment.id ? "Undoing…" : "Undo refund"}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setUndoingId(payment.id)} className={buttonVariants({ variant: "secondary", size: "sm" })}>Undo refund</button>
              )}
            </div>
          )}

          {((onCancelBill && (payment.status === "AWAITING_TRANSFER" || payment.status === "REJECTED")) || (onMarkPaid && payment.status === "AWAITING_TRANSFER")) && (
            <div className="mt-4 border-t border-slate-50/10 pt-3">
              {markingId === payment.id ? (
                <div className="space-y-2">
                  <p className="text-small text-slate-300">
                    Record {formatUsd(payment.amountCents)} as received from {payment.user.name ?? payment.user.email}? Use this when the money came another way, like cash or a bank email
                    that never arrived. It is approved now, exactly as if they had sent it in.
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setMarkingId(null)} disabled={busyId === payment.id} className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low">Back</button>
                    <button type="button" onClick={() => handleMarkPaid(payment.id)} disabled={busyId === payment.id} className={buttonVariants({ variant: "primary", className: "flex-1" })}>
                      {busyId === payment.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                      {busyId === payment.id ? "Recording…" : "Yes, mark paid"}
                    </button>
                  </div>
                </div>
              ) : cancelingId === payment.id ? (
                <div className="space-y-2">
                  <p className="text-small text-slate-400"><Hint>Close this unpaid bill? The record stays as expired. The plan is not changed.</Hint></p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setCancelingId(null)} disabled={busyId === payment.id} className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low">Keep</button>
                    <button type="button" onClick={() => handleCancelBill(payment.id)} disabled={busyId === payment.id} className={buttonVariants({ variant: "primary", className: "flex-1" })}>
                      {busyId === payment.id ? "Closing…" : "Cancel bill"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {onMarkPaid && payment.status === "AWAITING_TRANSFER" && (
                    <button type="button" onClick={() => setMarkingId(payment.id)} className={buttonVariants({ variant: "secondary", size: "sm" })}>Mark paid</button>
                  )}
                  {onCancelBill && (
                    <button type="button" onClick={() => setCancelingId(payment.id)} className={buttonVariants({ variant: "secondary", size: "sm" })}>Cancel bill</button>
                  )}
                </div>
              )}
            </div>
          )}

          {onDelete &&
            (deletingId === payment.id ? (
              <div className="mt-4 space-y-2 border-t border-slate-50/10 pt-3">
                <p className="text-small text-slate-400"><Hint>Delete this record for good? It does not undo any plan, credits or classes it already gave.</Hint></p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDeletingId(null)}
                    disabled={busyId === payment.id}
                    className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(payment.id)}
                    disabled={busyId === payment.id}
                    className="tap flex flex-1 items-center justify-center rounded-full bg-red-500/95 py-2 text-small font-semibold text-slate-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 shadow-raised-low active:shadow-pressed-low hover:shadow-raised-mid"
                  >
                    {busyId === payment.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                    {busyId === payment.id ? "Deleting…" : "Delete payment"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDeletingId(payment.id)}
                disabled={busyId === payment.id}
                className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-3" })}
              >
                Delete
              </button>
            ))}
        </motion.div>
        );
      }}
      </ViewMore>
    </div>
  );
}
