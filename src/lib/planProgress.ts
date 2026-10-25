import { BILLING_CYCLE_DAYS } from "@/lib/billingCycle";

export interface PlanProgress {
  billsPaid: number;
  billsTotal: number;
  billsLeft: number;
  /** Days the paid bills cover, and the days the whole plan covers (28 days a bill). */
  daysCovered: number;
  daysTotal: number;
  percent: number;
  /** Every bill of this plan is paid. */
  done: boolean;
  /** When the next bill is due; null once every bill is paid or when it is not known. */
  nextBillAt: Date | null;
}

/** What "Your plan" shows: bills paid, bills left and the 28-day cycles they cover. */
export function planProgress(input: { installmentsPaid: number; termMonths: number; nextDueDate?: Date | string | null }): PlanProgress {
  const billsTotal = Math.max(1, Math.floor(input.termMonths));
  const billsPaid = Math.min(billsTotal, Math.max(0, Math.floor(input.installmentsPaid)));
  const billsLeft = billsTotal - billsPaid;
  const next = input.nextDueDate ? new Date(input.nextDueDate) : null;
  return {
    billsPaid,
    billsTotal,
    billsLeft,
    daysCovered: billsPaid * BILLING_CYCLE_DAYS,
    daysTotal: billsTotal * BILLING_CYCLE_DAYS,
    percent: Math.round((billsPaid / billsTotal) * 100),
    done: billsLeft === 0,
    nextBillAt: billsLeft > 0 && next && !Number.isNaN(next.getTime()) ? next : null,
  };
}
