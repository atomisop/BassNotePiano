// Moving a plan's next bill to another day (Admin > student page > Bill date, owner only). Pure, so the date checks are tested
// without a database (tests/billDateRules.test.ts); the change itself is changePlanBillDate in paymentPlans.ts.

const DAY_MS = 86_400_000;
/** The furthest ahead a bill can be moved. */
export const MAX_BILL_DATE_DAYS = 365;

/** Whole days between two YYYY-MM-DD keys (b - a). */
export function daysBetweenKeys(a: string, b: string): number {
  const t = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  return Math.round((t(b) - t(a)) / DAY_MS);
}

/**
 * Why a bill cannot move to `newDay` (YYYY-MM-DD, Eastern), or null when it can. `todayKey` and `currentKey` are the Eastern day
 * keys of today and of the bill's current date.
 */
export function billDateBlockedReason(input: { newDay: string; todayKey: string; currentKey: string; status: string; paused: boolean }): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.newDay)) return "Pick a date.";
  if (input.status !== "ACTIVE") return "Only a running plan has a next bill.";
  if (input.paused) return "This plan is paused. Resume it first; resuming moves the bill back by itself.";
  if (input.newDay === input.currentKey) return "That is already the bill date.";
  if (daysBetweenKeys(input.todayKey, input.newDay) < 0) return "Pick today or a later day. A bill in the past would be overdue at once.";
  if (daysBetweenKeys(input.todayKey, input.newDay) > MAX_BILL_DATE_DAYS) return "Pick a day within a year.";
  return null;
}

/** The new due moment: the current one moved by whole days, so the bill keeps its usual time of day. */
export function movedDueDate(current: Date, currentKey: string, newDay: string): Date {
  return new Date(current.getTime() + daysBetweenKeys(currentKey, newDay) * DAY_MS);
}
