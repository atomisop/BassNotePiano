/**
 * Soft holds: a weekly time (a schedule window and which hour of it) the teacher is keeping for a contact.
 * Pure rules only, so the browser can share them. A hold never blocks a booking; it only makes the admin booking
 * screen ask first.
 */

export interface HoldLike {
  scheduleId: string;
  chunkIndex: number;
  /** The last date the hold applies to (stored at UTC midnight), or null for "until released". */
  until: Date | null;
  releasedAt: Date | null;
}

export function holdSlotKey(scheduleId: string, chunkIndex: number): string {
  return `${scheduleId}:${chunkIndex}`;
}

/** True when the hold still applies to the class on `occurrenceDate`: not released, and not past its last date. */
export function holdAppliesTo(hold: Pick<HoldLike, "until" | "releasedAt">, occurrenceDate: Date): boolean {
  if (hold.releasedAt) return false;
  if (!hold.until) return true;
  return occurrenceDate.getTime() <= hold.until.getTime();
}

/** True when two email addresses are the same inbox as typed (case and spaces aside): how a contact is matched to an account. */
export function sameInboxEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? "").trim().toLowerCase();
  return x !== "" && x === (b ?? "").trim().toLowerCase();
}

/** Reads a "YYYY-MM-DD" day as UTC midnight, or null when it is not a real date. */
export function parseDay(raw: string | null | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw ? null : date;
}
