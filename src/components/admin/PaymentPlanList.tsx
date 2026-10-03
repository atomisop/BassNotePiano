"use client";

import { AdminListSearch, matchesQuery } from "@/components/admin/AdminListSearch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminPaymentPlan } from "@/lib/paymentPlans";
import { describePaymentPlan } from "@/lib/classCreditPricing";
import { MorphingSquare } from "@/components/ui/morphing-square";

export interface PaymentPlanListProps {
  plans: AdminPaymentPlan[];
  onCancel: (planId: string, note: string) => Promise<void>;
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
  ACTIVE: "bg-[rgb(var(--c-s-50)/0.15)] text-[rgb(var(--c-s-50))]",
  COMPLETED: "bg-slate-50/15 text-slate-100",
  CANCELED: "bg-slate-800 text-slate-500",
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Same small "HH:mm" -> "H:MM AM/PM" formatter AdminScheduleManager.tsx already has, duplicated on purpose rather than shared — same convention this codebase already uses for small per-boundary formatting helpers. */
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
 * unchanged — this list is read-mostly by design.
 */
export function PaymentPlanList({ plans, onCancel, emptyMessage = "No plans to show." }: PaymentPlanListProps) {
  const [query, setQuery] = useState("");
  const shown = plans.filter((item) => matchesQuery(item, query));
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [note, setNote] = useState("");

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
      {shown.map((plan) => (
        <div key={plan.id} className="glass-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">
                {describePaymentPlan(plan.cadence, plan.term)}
              </p>
              <h3 className="mt-1 text-body text-slate-50 font-semibold">{plan.user.name ?? plan.user.email}</h3>
              <p className="mt-1 text-small text-slate-500">
                {plan.installmentsPaid} of {plan.termMonths} installments paid · {formatUsd(plan.installmentAmountCents)}/mo
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5 text-right">
              <span
                className={`inline-block rounded-full px-2.5 py-1 text-small font-medium uppercase tracking-wide ${STATUS_STYLE[plan.status]}`}
              >
                {STATUS_LABEL[plan.status]}
              </span>
              {plan.isOverdue && (
                <span className="inline-block rounded-full bg-red-400/15 px-2.5 py-1 text-small font-medium uppercase tracking-wide text-red-300">
                  Overdue
                </span>
              )}
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-small sm:grid-cols-3">
            <div>
              <dt className="text-small text-slate-600">Next due</dt>
              <dd className="text-slate-300">{new Date(plan.nextDueDate).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-small text-slate-600">Started</dt>
              <dd className="text-slate-300">{new Date(plan.createdAt).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-small text-slate-600">Reserved slot</dt>
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
                    className="flex-1 rounded-lg border border-ink/10 py-2 text-small font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancel(plan.id)}
                    disabled={busyId === plan.id || !note.trim()}
                    className="flex flex-1 items-center justify-center rounded-lg bg-red-500/95 py-2 text-small font-semibold text-slate-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyId === plan.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                    {busyId === plan.id ? "Canceling…" : "Confirm cancel"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setCancelingId(plan.id)}
                  className="w-full rounded-lg border border-ink/10 py-2 text-small font-medium text-slate-300 transition hover:bg-slate-800"
                >
                  Cancel plan
                </button>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
