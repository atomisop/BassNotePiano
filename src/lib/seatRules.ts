/**
 * Seats per slot (pure, no database). A weekly window (ClassSchedule) is cut into hour-long slots; `seats` is how many
 * students can share each one. 1 is the long-standing behavior: one student (or one weekly plan) per slot.
 *
 * One rule everywhere: the seats taken in a slot on a given week are
 *   (SCHEDULED class rows at that exact instant, counted per student)
 * + (live weekly plans keeping that time who have no class there yet).
 * The slot is full when that number reaches `seats`. A plan group that shares one weekly class (a payment plan's
 * `familyGroupId`) counts as ONE seat, the same way it has always shared one slot.
 */

export const MAX_SEATS = 1000;

export type SeatsResult = { ok: true; seats: number } | { ok: false; message: string };

/** Validates what the owner typed: a whole number from 1 to MAX_SEATS. Blank or missing means 1. */
export function parseSeats(raw: unknown): SeatsResult {
  if (raw === undefined || raw === null || raw === "") return { ok: true, seats: 1 };
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1) return { ok: false, message: "Seats per slot must be a whole number, 1 or more." };
  if (n > MAX_SEATS) return { ok: false, message: `Seats per slot can be at most ${MAX_SEATS}.` };
  return { ok: true, seats: n };
}

export interface SeatBooking {
  studentId: string;
  familyBookingGroupId: string | null;
  reservedByPlanId: string | null;
}

export interface SeatHolder {
  userId: string;
  familyGroupId: string | null;
}

/** A weekly plan group's classes are one seat; every other class row is its own student's seat. */
export function bookingUnit(b: SeatBooking): string {
  return b.reservedByPlanId && b.familyBookingGroupId ? `g:${b.familyBookingGroupId}` : `s:${b.studentId}`;
}

export function holderUnit(h: SeatHolder): string {
  return h.familyGroupId ? `g:${h.familyGroupId}` : `s:${h.userId}`;
}

/** Seats used by these class rows and these unbooked plan holders. A holder whose student (or group) already has a class there is not counted twice. */
export function countSeatUnits(bookings: SeatBooking[], holders: SeatHolder[]): { booked: number; held: number; taken: number } {
  const units = new Set(bookings.map(bookingUnit));
  const students = new Set(bookings.map((b) => b.studentId));
  const heldUnits = new Set<string>();
  for (const h of holders) {
    const unit = holderUnit(h);
    if (units.has(unit) || students.has(h.userId)) continue;
    heldUnits.add(unit);
  }
  return { booked: units.size, held: heldUnits.size, taken: units.size + heldUnits.size };
}

export function seatsLeftOf(seats: number, taken: number): number {
  return Math.max(0, seats - taken);
}

/** Small caption for the student screens: "2 left" when a shared slot is nearly full, otherwise nothing. */
export function seatsLeftNote(seats: number, seatsLeft: number | undefined): string | null {
  if (seats <= 1 || seatsLeft === undefined || seatsLeft <= 0 || seatsLeft > 3) return null;
  return `${seatsLeft} left`;
}

/** Seats a family booking of `attendees` students needs: one each, but never more than the slot has (a family still fits an empty 1-seat slot, as always). */
export function seatsNeededByParty(attendees: number, seats: number): number {
  return Math.min(Math.max(1, attendees), Math.max(1, seats));
}
