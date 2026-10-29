"use client";

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

export interface PaymentPlanListProps {
  plans: AdminPaymentPlan[];
  onCancel: (planId: string, note: string) => Promise<void>;
  /** Owner only: records money that was received but is not showing in revenue. */
  onRecordPayment?: (planId: string) => Promise<{ ok: boolean; error: string | null }>;
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

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-400/15 text-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.45)]",
  COMPLETED: "bg-slate-50/15 text-slate-100",
  CANCELED: "bg-neu-base shadow-pressed-low text-slate-500",
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
      const result = await onRecordPayment(id);
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
      const result = await onResendBill(id);
      setBillNote({ id, text: result.message, ok: result.ok });
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(id: string) {
    if (!note.trim()) return;
    setBusyId(id);
    try {
      await onCancel(id, note.trim());
      router.refresh();
      setCancelingId(null);
      setNote("");
    } finally {
      setBusyId(null);
    }
  }

  if (plans.length === 0) {
    return <div className="glass-surface p-8 text-center text-small text-slate-500">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-3">
      <AdminListSearch value={query} onChange={setQuery} placeholder="Search student, plan, status" shown={shown.length} total={plans.length} />
      {shown.length === 0 && <p className="text-small text-slate-400">Nothing matches that search.</p>}
      {recordError && <p className="text-small text-red-400">{recordError}</p>}
      <ViewMore items={shown} initial={8}>
      {(plan) => (
        <div key={plan.id} className="glass-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">
                {describePaymentPlan(plan.cadence, plan.term)}
              </p>
              <h2 className="mt-1 text-title text-slate-50 font-semibold">{plan.user.name ?? plan.user.email}</h2>
              {plan.familyGroup && (
                <p className="mt-1 text-small text-slate-400">
                  Family plan of {plan.familyGroup._count.plans}, paid by {plan.familyGroup.payer.name ?? plan.familyGroup.payer.email}
                </p>
              )}
              <p className="mt-1 text-small text-slate-500">
                {plan.installmentsPaid} of {plan.termMonths} installments paid · {formatUsd(plan.installmentAmountCents)}/mo
              </p>
              <p className="mt-1 text-small text-slate-500">Received {formatUsd(receivedCents(plan))}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 text-right">
              {plan.status === "ACTIVE" && isPausedNow(plan, new Date()) ? null : (
                <span
                  className={`inline-block rounded-full px-2.5 py-1 text-small font-medium uppercase tracking-wide ${STATUS_STYLE[plan.status]}`}
                >
                  {STATUS_LABEL[plan.status]}
                </span>
              )}
              {plan.status === "ACTIVE" && (
                <Link href={`/admin/users/${plan.user.id}#scheduler`} className="tap inline-flex items-center text-small font-medium text-slate-50 underline underline-offset-4">
                  Scheduler
                </Link>
              )}
              {plan.isOverdue && (
                <span className="inline-block rounded-full bg-red-400/15 px-2.5 py-1 text-small font-medium uppercase tracking-wide text-red-300">
                  Overdue
                </span>
              )}
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-small sm:grid-cols-3">
            <div>
              <dt className="text-small text-slate-500">Next due</dt>
              <dd className="text-slate-300">{plan.status === "ACTIVE" && isPausedNow(plan, new Date()) && isIndefinitePause(plan) ? "On resume" : new Date(plan.nextDueDate).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-small text-slate-500">Started</dt>
              <dd className="text-slate-300">{new Date(plan.createdAt).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-small text-slate-500">Reserved slot</dt>
              <dd className="text-slate-300">
                {plan.reservedSchedule
                  ? `${DAY_LABELS[plan.reservedSchedule.dayOfWeek]} ${formatTimeLabel(plan.reservedSchedule.startTime)}${plan.reservedSchedule.label ? ` · ${plan.reservedSchedule.label}` : ""}`
                  : "None"}
              </dd>
            </div>
          </dl>

          {plan.status === "CANCELED" && plan.cancellationNote && (
            <p className="mt-2 text-small text-red-400">Canceled: {plan.cancellationNote}</p>
          )}

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
                      className="tap flex-1 rounded-lg py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
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
                  <p className="text-small text-slate-300">No payment on record for this plan.</p>
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
                    className="tap flex-1 rounded-lg py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancel(plan.id)}
                    disabled={busyId === plan.id || !note.trim()}
                    className="tap flex flex-1 items-center justify-center rounded-lg bg-red-500/95 py-2 text-small font-semibold text-slate-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 shadow-raised-low active:shadow-pressed-low hover:shadow-raised-mid"
                  >
                    {busyId === plan.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                    {busyId === plan.id ? "Canceling…" : "Confirm cancel"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {onResendBill && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleResend(plan.id)}
                      disabled={busyId === plan.id}
                      className={buttonVariants({ variant: "secondary", className: "w-full" })}
                    >
                      {busyId === plan.id && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                      {busyId === plan.id ? "Sending…" : "Resend bill"}
                    </button>
                    {billNote?.id === plan.id && <p className={`text-small ${billNote.ok ? "text-slate-300" : "text-red-400"}`}>{billNote.text}</p>}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setCancelingId(plan.id)}
                  className="tap w-full rounded-lg py-2 text-small font-medium text-slate-300 transition bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                >
                  Cancel plan
                </button>
              </div>
            ))}
        </div>
      )}
      </ViewMore>
    </div>
  );
}
