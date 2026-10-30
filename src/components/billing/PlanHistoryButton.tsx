"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";

export interface PastPlanRow {
  id: string;
  name: string;
  billsPaid: number;
  billsTotal: number;
  status: "COMPLETED" | "CANCELED" | "ACTIVE";
  /** ISO date the plan was started. */
  startedAt: string;
}

const STATUS_LABEL: Record<PastPlanRow["status"], string> = { COMPLETED: "Completed", CANCELED: "Canceled", ACTIVE: "Active" };

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** The clock in the corner of the plan screen: opens every earlier plan, so the page itself stays short. */
export function PlanHistoryButton({ plans }: { plans: PastPlanRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={plans.length > 0 ? `Plan history, ${plans.length} earlier ${plans.length === 1 ? "plan" : "plans"}` : "Plan history"}
        className="tap relative flex h-11 w-11 items-center justify-center rounded-full bg-neu-base text-slate-200 shadow-raised-low transition hover:text-slate-50 active:shadow-pressed-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Clock aria-hidden className="h-5 w-5" strokeWidth={1.75} />
        {plans.length > 0 && <span aria-hidden className="absolute right-2 top-2 h-2 w-2 rounded-full bg-signal" />}
      </button>

      <Dialog open={open} onOpenChange={setOpen} title="Plan history">
        {plans.length === 0 ? (
          <p className="text-small text-slate-400">No earlier plans yet. Plans that finished or were canceled show up here.</p>
        ) : (
          <ul className="space-y-3">
            {plans.map((plan) => (
              <li key={plan.id} className="rounded-xl bg-neu-base p-4 shadow-raised-low">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 text-small font-medium text-slate-100">{plan.name}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-small font-medium ${plan.status === "COMPLETED" ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-300"}`}>
                    {STATUS_LABEL[plan.status]}
                  </span>
                </div>
                <p className="mt-1 text-small text-slate-500">
                  {plan.billsPaid} of {plan.billsTotal} bills paid · started {day(plan.startedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </>
  );
}
