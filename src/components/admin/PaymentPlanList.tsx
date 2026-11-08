"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import Link from "next/link";
import { AdminListSearch, matchesQuery } from "@/components/admin/AdminListSearch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminPaymentPlan } from "@/lib/paymentPlans";
import { describePaymentPlan } from "@/lib/classCreditPricing";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { isIndefinitePause, isPausedNow } from "@/lib/planPause";
import { ViewMore } from "@/components/ui/ViewMore";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreditCard } from "@/components/ui/appIcons";
import { StatusDot } from "@/components/ui/StatusDot";
import { toast } from "@/components/ui/Toaster";

export interface PaymentPlanListProps {
  plans: AdminPaymentPlan[];
  onCancel: (planId: string, note: string, notify?: boolean) => Promise<void>;
  /** Owner only: records money that was received but is not showing in revenue. */
  onRecordPayment?: (planId: string, notify?: boolean) => Promise<{ ok: boolean; error: string | null }>;
  /** Sends the open bill to the student again. */
  onResendBill?: (planId: string) => Promise<{ ok: boolean; message: string }>;
  emptyMessage?: string;
}

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

const STATUS_TONE: Record<string, "success" | "neutral"> = {
  ACTIVE: "success",
  COMPLETED: "neutral",
  CANCELED: "neutral",
};

function receivedCents(plan: AdminPaymentPlan): number {
  return plan.installmentPayments.filter((p) => p.status === "VERIFIED").reduce((sum, p) => sum + p.amountCents, 0);
}

/** Active, but fewer verified payments than the installments it says were paid (or none at all). */
function needsPaymentRecord(plan: AdminPaymentPlan): boolean {
  const verified = plan.installmentPayments.filter((p) => p.status === "VERIFIED").length;
  return verified === 0 || verified < plan.installmentsPaid;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Same small "HH:mm" -> "H:MM AM/PM" formatter AdminScheduleManager.tsx already has, duplicated on purpose rather than shared, same convention this codebase already uses for small per-boundary formatting helpers. */
function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Admin-only visibility + the one manual action this app offers for a plan:
 * canceling it. Approving/rejecting an individual installment's actual
 * payment happens entirely through the existing /admin/payments queue,
 * unchanged, this list is read-mostly by design.
 */
export function PaymentPlanList({ plans, onCancel, onRecordPayment, onResendBill, emptyMessage = "No plans to show." }: PaymentPlanListProps) {
  const [query, setQuery] = useState("");
  const [notify, setNotify] = useNotifyStudent("student-changes");
  const shown = plans.filter((item) => matchesQuery(item, query));
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [billNote, setBillNote] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  async function handleRecord(id: string) {
    if (!onRecordPayment) return;
    setBusyId(id);
    setRecordError(null);
    try {
      const h = await toast.held("Recording the payment", () => onRecordPayment(id, notify), { mail: notify });
      if (h.undone) return;
      const result = h.value;
      if (!result.ok) {
        setRecordError(result.error);
        return;
      }
      setRecordingId(null);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleResend(id: string) {
    if (!onResendBill) return;
    setBusyId(id);
    try {
      const h = await toast.held("Resending the bill", () => onResendBill(id), { mail: true });
      if (h.undone) return;
      const result = h.value;
      setBillNote({ id, text: result.message, ok: result.ok });
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(id: string) {
    if (!note.trim()) return;
    setBusyId(id);
    try {
      const h = await toast.held("Canceling the plan", () => onCancel(id, note.trim(), notify), { mail: notify });
      if (h.undone) return;
      router.refresh();
      setCancelingId(null);
      setNote("");
    } finally {
      setBusyId(null);
    }
  }

  if (plans.length === 0) {
    return <EmptyState icon={<CreditCard />} title={emptyMessage.replace(/\.$/, "")} description="Plans appear here as students start them." />;
  }

  return (
    <div data-stagger="" className="space-y-3">
      <AdminListSearch value={query} onChange={setQuery} placeholder="Search student, plan, status" shown={shown.length} total={plans.length} />
      <NotifyToggle on={notify} onChange={setNotify} label="Notify the student" />
      {shown.length === 0 && <p className="text-small text-slate-400">Nothing matches that search.</p>}
      {recordError && <p className="text-small text-red-400">{recordError}</p>}
      <ViewMore items={shown} initial={8}>
      {(plan) => (
        <div key={plan.id} className="glass-surface p-4">
          {/* The name, what is owed and when: bold. Everything else sits back in gray. */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-title font-semibold text-slate-50">{plan.user.name ?? plan.user.email}</h2>
              <p className="mt-0.5 text-small text-slate-500">{describePaymentPlan(plan.cadence, plan.term)}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {plan.isOverdue && <StatusDot tone="danger">Overdue</StatusDot>}
              {plan.status === "ACTIVE" && isPausedNow(plan, new Date()) && <StatusDot tone="neutral">Paused</StatusDot>}
              {plan.status !== "ACTIVE" && <StatusDot tone={STATUS_TONE[plan.status] ?? "neutral"}>{STATUS_LABEL[plan.status]}</StatusDot>}
            </div>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-headline font-semibold tabular-nums text-slate-50">{formatUsd(plan.installmentAmountCents)}</p>
              <p className={`text-small ${plan.isOverdue ? "font-medium text-red-400" : "text-slate-400"}`}>
                {plan.status !== "ACTIVE"
                  ? `Received ${formatUsd(receivedCents(plan))}`
                  : isPausedNow(plan, new Date()) && isIndefinitePause(plan)
                    ? "Due on resume"
                    : `${plan.isOverdue ? "Was due" : "Due"} ${new Date(plan.nextDueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
              </p>
            </div>
            <div className="text-right text-small tabular-nums text-slate-500">
              <p>
                <span className="font-medium text-slate-300">{plan.installmentsPaid}</span>/{plan.termMonths} paid
              </p>
              {plan.reservedSchedule && (
                <p>
                  {DAY_LABELS[plan.reservedSchedule.dayOfWeek]} {formatTimeLabel(plan.reservedSchedule.startTime)}
                </p>
              )}
            </div>
          </div>

          <div aria-hidden className="mt-3 flex gap-1">
            {Array.from({ length: Math.min(plan.termMonths, 12) }, (_, i) => (
              <span key={i} className={`h-1 flex-1 rounded-full ${i < plan.installmentsPaid ? "bg-signal" : "bg-slate-50/10"}`} />
            ))}
          </div>

          {(plan.familyGroup || (plan.status === "ACTIVE" && receivedCents(plan) > 0)) && (
            <p className="mt-2 text-caption text-slate-500">
              {plan.familyGroup ? `Group of ${plan.familyGroup._count.plans}, paid by ${plan.familyGroup.payer.name ?? plan.familyGroup.payer.email}` : ""}
              {plan.familyGroup && plan.status === "ACTIVE" && receivedCents(plan) > 0 ? " · " : ""}
              {plan.status === "ACTIVE" && receivedCents(plan) > 0 ? `${formatUsd(receivedCents(plan))} received` : ""}
            </p>
          )}

          {plan.status === "CANCELED" && plan.cancellationNote && <p className="mt-2 text-small text-red-400">{plan.cancellationNote}</p>}

          {onRecordPayment && plan.status === "ACTIVE" && needsPaymentRecord(plan) && (
            <div className="mt-4 rounded-lg bg-neu-base p-3 shadow-pressed-low">
              {recordingId === plan.id ? (
                <div className="space-y-2">
                  <p className="text-small text-slate-300">
                    Record {formatUsd(plan.installmentAmountCents)} as received from {plan.user.name ?? plan.user.email}? This counts it in revenue
                    {plan.installmentsPaid === 0 ? ", opens their access, grants their credits and books their weekly time" : ""}.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRecordingId(null)}
                      disabled={busyId === plan.id}
                      className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRecord(plan.id)}
                      disabled={busyId === plan.id}
                      className={buttonVariants({ variant: "primary", className: "flex-1" })}
                    >
                      {busyId === plan.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                      {busyId === plan.id ? "Recording…" : "Confirm"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-small text-slate-300">No payment recorded.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setRecordError(null);
                      setRecordingId(plan.id);
                    }}
                    className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0" })}
                  >
                    Record payment
                  </button>
                </div>
              )}
            </div>
          )}

          {plan.status === "ACTIVE" &&
            (cancelingId === plan.id ? (
              <div className="mt-4 space-y-2">
                <textarea
                  autoFocus
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why is this plan being canceled?"
                  rows={2}
                  className="w-full resize-none glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-red-400/60"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCancelingId(null);
                      setNote("");
                    }}
                    disabled={busyId === plan.id}
                    className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancel(plan.id)}
                    disabled={busyId === plan.id || !note.trim()}
                    className="tap flex flex-1 items-center justify-center rounded-full bg-red-500/95 py-2 text-small font-semibold text-slate-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 shadow-raised-low active:shadow-pressed-low hover:shadow-raised-mid"
                  >
                    {busyId === plan.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                    {busyId === plan.id ? "Canceling…" : "Confirm cancel"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                {/* Compact actions at the end of the plan, not full-width bars: Resend is the everyday one, Cancel stays quiet. */}
                <Link href={`/admin/users/${plan.user.id}#scheduler`} className={buttonVariants({ variant: "ghost", size: "sm", className: "text-slate-400" })}>
                  Scheduler
                </Link>
                {onResendBill && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleResend(plan.id)}
                      disabled={busyId === plan.id}
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      {busyId === plan.id && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                      {busyId === plan.id ? "Sending…" : "Resend bill"}
                    </button>
                    {billNote?.id === plan.id && <p className={`basis-full text-right text-small ${billNote.ok ? "text-slate-300" : "text-red-400"}`}>{billNote.text}</p>}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setCancelingId(plan.id)}
                  className={buttonVariants({ variant: "ghost", size: "sm", className: "text-red-300 hover:text-red-200" })}
                >
                  Cancel
                </button>
              </div>
            ))}
        </div>
      )}
      </ViewMore>
    </div>
  );
}
