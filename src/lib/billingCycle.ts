// How long one bill covers. Every payment plan is billed in cycles of exactly 28 days (four weeks), so a cycle always holds exactly four
// of any weekday: four classes a cycle, never a fifth, whatever month it falls in. A pure function of a date, so it is tested without a
// database. Everything that used to add "one calendar month" to a date (the paid period, the credits' expiry, the next due date) goes
// through here.

export const BILLING_CYCLE_DAYS = 28;
export const BILLING_CYCLE_MS = BILLING_CYCLE_DAYS * 86_400_000;

/** `date` moved forward by `cycles` billing cycles (backward when negative). */
export function addBillingCycles(date: Date, cycles: number): Date {
  return new Date(date.getTime() + cycles * BILLING_CYCLE_MS);
}
