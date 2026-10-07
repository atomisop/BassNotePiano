// Booking rules that the booking screen needs to know too. No database here, so
// both the server (classSchedule.ts) and the browser can import it.

/**
 * Classes a subscriber may hold in one week through their credits: one. A
 * subscriber's monthly credits are meant to pay for their weekly class, so
 * having credits left over (after a skip, a cancel, or a bonus grant) must not
 * be a way to book a second class that week. More time that week is bought as
 * an extra session, which is paid separately and never goes through the credit
 * booking path.
 */
export const SUBSCRIBER_CLASSES_PER_WEEK = 1;

/** Sunday 00:00 UTC of the week holding an occurrenceDate (a UTC-midnight stand-in for an ET calendar day), and the Sunday after. */
export function weekRangeForOccurrence(occurrenceDate: Date): { start: Date; end: Date } {
  const start = new Date(occurrenceDate.getTime() - occurrenceDate.getUTCDay() * 86_400_000);
  return { start, end: new Date(start.getTime() + 7 * 86_400_000) };
}
