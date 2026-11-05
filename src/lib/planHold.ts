/**
 * Whether a payment plan's standing weekly time is really held on one given week.
 *
 * A plan keeps its weekly time for as long as it runs, but a week it is not using is free for others:
 * before its first class (the plan starts on a later Saturday), and any week whose class was skipped,
 * moved or canceled. The screen's open-times list and the server's booking check both call this, so they
 * can never disagree (a time shown as open must be accepted, and a refused time must be shown as held).
 * Pure so it is tested without a database.
 */
export interface PlanHoldBooking {
  occurrenceDate: Date;
  status: string; // SCHEDULED | COMPLETED | CANCELED
}

export function planHoldsOccurrence(bookings: PlanHoldBooking[], occurrenceDate: Date): boolean {
  // A plan with no class on the calendar yet keeps its time (just enrolled, classes not booked).
  if (bookings.length === 0) return true;
  const day = occurrenceDate.getTime();
  const first = Math.min(...bookings.map((b) => b.occurrenceDate.getTime()));
  // Before its first class the plan is not using the time yet.
  if (day < first) return false;
  const that = bookings.filter((b) => b.occurrenceDate.getTime() === day);
  // That week's class was skipped, moved or canceled and nothing else took its place.
  if (that.length > 0 && that.every((b) => b.status === "CANCELED")) return false;
  return true;
}
