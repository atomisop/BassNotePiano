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
import { CardFoot, CardHead, Callout, Fact, Facts, Meta } from "@/components/ui/CardKit";
import { toast } from "@/components/ui/Toaster";

export interface PaymentPlanListProps {
  plans: AdminPaymentPlan[];
  onCancel: (planId: string, note: string, notify?: boolean) => Promise<void>;
  /** Owner only: records money that was received but is not showing in revenue. */
  onRecordPayment?: (planId: string, notify?: boolean) => Promise<{ ok: boolean; error: string | null }>;
  /** Sends the open bill to the student again. */
  onResendBill?: (planId: string) => Promise<{ ok: boolean; message: string }>;
  /** Days a plan's weekly time stays held while its first payment is missing (Settings > Payments). */
  firstPaymentHoldDays?: number;
  emptyMessage?: string;
}

/** "Nov 23", with the year only when it is not this year: a date speaks for itself, so it needs no "Date:" label. */
function shortDate(value: Date | string): string {
  const d = new Date(value);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
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

/**
 * A plan is "Active" the moment it is set up (its weekly time is held), but nothing has been paid until the first
 * installment is approved. Say that plainly instead of showing a green Active dot on an unpaid plan.
 */
function planBadge(plan: AdminPaymentPlan): { label: string; tone: "success" | "neutral" | "warning" } {
  if (plan.status === "ACTIVE" && plan.installmentsPaid === 0) {
    const first = plan.installmentPayments.find((p) => p.status === "PENDING_REVIEW" || p.status === "AWAITING_TRANSFER" || p.status === "REJECTED");
    return { label: first?.status === "PENDING_REVIEW" ? "First payment to review" : "Waiting for first payment", tone: "warning" };
  }
  return { label: STATUS_LABEL[plan.status], tone: STATUS_TONE[plan.status] ?? "neutral" };
}

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
export function PaymentPlanList({ plans, onCancel, onRecordPayment, onResendBill, firstPaymentHoldDays, emptyMessage = "No plans to show." }: PaymentPlanListProps) {
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
      {(plan) => {
        const name = plan.user.name ?? plan.user.email;
        const paused = plan.status === "ACTIVE" && isPausedNow(plan, new Date());
        const badge = planBadge(plan);
        // Status only when it is news: a healthy Active plan on the Active list needs no badge (DESIGN.md, Hierarchy rule 5).
        const status = plan.isOverdue ? (
          <StatusDot tone="danger">Overdue</StatusDot>
        ) : paused ? (
          <StatusDot tone="neutral">{isIndefinitePause(plan) ? "Paused" : `Paused to ${shortDate(plan.pauseUntil ?? plan.nextDueDate)}`}</StatusDot>
        ) : plan.status !== "ACTIVE" || badge.tone === "warning" ? (
          <StatusDot tone={badge.tone}>{badge.label}</StatusDot>
        ) : null;
        const slot = plan.reservedSchedule ? `${DAY_LABELS[plan.reservedSchedule.dayOfWeek]} ${formatTimeLabel(plan.reservedSchedule.startTime)}` : null;
        return (
        <article key={plan.id} className="rounded-card bg-neu-base p-4 shadow-raised-mid md:p-5">
          <CardHead
            eyebrow={describePaymentPlan(plan.cadence, plan.term)}
            title={
              <Link href={`/admin/users/${plan.user.id}`} className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {name}
              </Link>
            }
            subtitle={plan.familyGroup ? `Group of ${plan.familyGroup._count.plans}, paid by ${plan.familyGroup.payer.name ?? plan.familyGroup.payer.email}` : undefined}
            status={status}
          />

          <Facts className="mt-4">
            <Fact
              label={plan.isOverdue ? "Bill was due" : "Next bill"}
              value={paused && isIndefinitePause(plan) ? "On resume" : shortDate(plan.nextDueDate)}
              tone={plan.isOverdue ? "danger" : "default"}
            />
            <Fact label="Bills paid" value={`${plan.installmentsPaid} of ${plan.termMonths}`} />
            <Fact label="Every 28 days" value={formatUsd(plan.installmentAmountCents)} />
            <Fact label={plan.reservedSchedule?.label ?? "Weekly class"} value={slot ?? "None"} tone={slot ? "default" : "muted"} />
          </Facts>

          <Meta className="mt-3" items={[`Started ${shortDate(plan.createdAt)}`, `Received ${formatUsd(receivedCents(plan))}`]} />

          {plan.status === "CANCELED" && plan.cancellationNote && (
            <Callout tone="neutral" className="mt-3">Canceled: {plan.cancellationNote}</Callout>
          )}

          {onRecordPayment && plan.status === "ACTIVE" && needsPaymentRecord(plan) && (
            <div className="mt-3">
              {recordingId === plan.id ? (
                <Callout tone="warning">
                  <p>
                    Record {formatUsd(plan.installmentAmountCents)} as received from {name}? This counts it in revenue
                    {plan.installmentsPaid === 0 ? ", opens their access, grants their credits and books their weekly time" : ""}.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRecordingId(null)}
                      disabled={busyId === plan.id}
                      className={buttonVariants({ variant: "secondary", size: "sm", className: "flex-1" })}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRecord(plan.id)}
                      disabled={busyId === plan.id}
                      className={buttonVariants({ variant: "primary", size: "sm", className: "flex-1" })}
                    >
                      {busyId === plan.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                      {busyId === plan.id ? "Recording…" : "Confirm"}
                    </button>
                  </div>
                </Callout>
              ) : (
                <Callout
                  tone="warning"
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        setRecordError(null);
                        setRecordingId(plan.id);
                      }}
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      Record payment
                    </button>
                  }
                >
                  No payment on record for this plan.
                </Callout>
              )}
            </div>
          )}

          {plan.status === "ACTIVE" &&
            (cancelingId === plan.id ? (
              <div className="mt-4 space-y-2 border-t border-slate-50/8 pt-3">
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
                    className={buttonVariants({ variant: "secondary", size: "sm", className: "flex-1" })}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancel(plan.id)}
                    disabled={busyId === plan.id || !note.trim()}
                    className={buttonVariants({ variant: "danger", size: "sm", className: "flex-1" })}
                  >
                    {busyId === plan.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                    {busyId === plan.id ? "Canceling…" : "Confirm cancel"}
                  </button>
                </div>
              </div>
            ) : (
              <CardFoot className="justify-between">
                {/* The destructive action sits alone at the far end from the everyday ones, quiet, so it is never tapped by mistake. */}
                <button
                  type="button"
                  onClick={() => setCancelingId(plan.id)}
                  className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 text-red-300 hover:text-red-200" })}
                >
                  Cancel plan
                </button>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Link href={`/admin/users/${plan.user.id}#scheduler`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    Schedule
                  </Link>
                  {onResendBill && (
                    <button
                      type="button"
                      onClick={() => handleResend(plan.id)}
                      disabled={busyId === plan.id}
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      {busyId === plan.id && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                      {busyId === plan.id ? "Sending…" : "Resend bill"}
                    </button>
                  )}
                </div>
                {billNote?.id === plan.id && <p className={`basis-full text-right text-small ${billNote.ok ? "text-slate-300" : "text-red-400"}`}>{billNote.text}</p>}
              </CardFoot>
            ))}
        </article>
        );
      }}
      </ViewMore>
    </div>
  );
}
