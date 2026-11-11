// Split out from classSchedule.ts on purpose: that module pulls in Prisma,
// which must never end up in a "use client" bundle (both the student booking
// view and the admin attendance roster format occurrence times client-side).
// Same pattern as classCreditPricing.ts / classRegistrationLabels.ts.

import { CLASS_MINUTES, CREDITS_PER_CLASS } from "@/lib/classCreditPricing";

/** "Thursday, Oct 15, 11:00 AM ET": class times in notices and emails always read in Eastern time, wherever the server runs. */
export function formatEtDateTime(date: Date): string {
  const text = date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${text} ET`;
}

const ET = "America/New_York";

/** "Sat, Oct 31, 2:00 PM": a class time in Eastern, wherever the screen or server runs. Admin screens use this so one class never reads as two times. */
export function formatEtShort(when: string | Date, opts: { weekday?: boolean } = { weekday: true }): string {
  return new Date(when).toLocaleString("en-US", {
    timeZone: ET,
    ...(opts.weekday === false ? {} : { weekday: "short" as const }),
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The Eastern clock time a booking that spent `credits` ends at. */
export function formatEtEndTime(scheduledAtIso: string, credits: number): string {
  const end = new Date(new Date(scheduledAtIso).getTime() + (credits / CREDITS_PER_CLASS) * CLASS_MINUTES * 60_000);
  return end.toLocaleTimeString("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" });
}

/** In the viewer's own clock. `timeZone` is only for a first paint that must match the server's (see ScheduleClient). */
export function formatDateTime(iso: string, timeZone?: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone });
}

/** The clock time a booking that spent `credits` ends at: a class (CREDITS_PER_CLASS credits) runs CLASS_MINUTES. */
export function formatEndTime(scheduledAtIso: string, credits: number, timeZone?: string): string {
  const end = new Date(new Date(scheduledAtIso).getTime() + (credits / CREDITS_PER_CLASS) * CLASS_MINUTES * 60_000);
  return end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone });
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

/** Whole classes a weekly window holds: one starts every hour, and a class needs CLASS_MINUTES free. */
export function classesInWindow(durationMin: number): number {
  return durationMin < CLASS_MINUTES ? 0 : Math.floor((durationMin - CLASS_MINUTES) / 60) + 1;
}

/** Internal credits as whole classes, for showing a balance ("3 classes"). */
export function creditsToClasses(credits: number): number {
  return Math.floor(credits / CREDITS_PER_CLASS);
}
