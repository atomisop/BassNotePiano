// Split out from classSchedule.ts on purpose: that module pulls in Prisma,
// which must never end up in a "use client" bundle (both the student booking
// view and the admin attendance roster format occurrence times client-side).
// Same pattern as classCreditPricing.ts / classRegistrationLabels.ts.

import { CLASS_MINUTES, CREDITS_PER_CLASS } from "@/lib/classCreditPricing";

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The clock time a booking that spent `credits` ends at: a class (CREDITS_PER_CLASS credits) runs CLASS_MINUTES. */
export function formatEndTime(scheduledAtIso: string, credits: number): string {
  const end = new Date(new Date(scheduledAtIso).getTime() + (credits / CREDITS_PER_CLASS) * CLASS_MINUTES * 60_000);
  return end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * "11:00" + 60 minutes = "12:00". A weekly window (say 11:00 AM to 3:00 PM) is
 * cut into back-to-back bookable pieces (chunksForSchedule in classSchedule.ts),
 * and each piece starts `offsetMin` after the window does. Anything that shows
 * the time of a chosen piece must add its offset, or every piece of a window
 * reads as the window's own start time.
 */
export function addMinutesToHHmm(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}
