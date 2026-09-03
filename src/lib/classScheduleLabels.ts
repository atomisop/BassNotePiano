// Split out from classSchedule.ts on purpose: that module pulls in Prisma,
// which must never end up in a "use client" bundle (both the student booking
// view and the admin attendance roster format occurrence times client-side).
// Same pattern as classCreditPricing.ts / classRegistrationLabels.ts.

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The clock time `credits` worth of 30-minute chunks past `scheduledAtIso` lands on. */
export function formatEndTime(scheduledAtIso: string, credits: number): string {
  const end = new Date(new Date(scheduledAtIso).getTime() + credits * 30 * 60_000);
  return end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
