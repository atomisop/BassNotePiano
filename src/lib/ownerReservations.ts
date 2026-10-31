import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export interface ReservationLike {
  scheduleId: string;
  occurrenceDate: Date;
  /** null = the whole window that day. */
  chunkIndex: number | null;
  releasedAt: Date | null;
}

/** True when the reservation keeps that exact class: same window and day, and either the whole window or that hour. */
export function reservationCovers(r: ReservationLike, scheduleId: string, occurrenceDate: Date, chunkIndex: number): boolean {
  if (r.releasedAt) return false;
  if (r.scheduleId !== scheduleId) return false;
  if (r.occurrenceDate.getTime() !== occurrenceDate.getTime()) return false;
  return r.chunkIndex === null || r.chunkIndex === chunkIndex;
}

export const OWNER_RESERVED_MESSAGE = "This time is reserved by the owner.";

/**
 * True when the reservation is for this person: their account's VERIFIED email equals the one the owner typed (capitals ignored).
 * An unverified address never counts, so signing up with someone else's email cannot unlock their time. Nothing else is compared
 * (no Gmail dot or plus-tag folding): an exact match is the safe reading of "the right customer".
 */
export function reservationIsFor(reservationEmail: string, user: { email: string | null; emailVerified: Date | null } | null): boolean {
  if (!user?.email || !user.emailVerified) return false;
  return user.email.trim().toLowerCase() === reservationEmail.trim().toLowerCase();
}

/**
 * The live reservation that keeps this class from the given person, if any. Pass `forStudentId` and a reservation made for that
 * person (see reservationIsFor) does not count: it is their time. Without it every live reservation counts.
 */
export async function findOwnerReservation(db: Db, scheduleId: string, occurrenceDate: Date, chunkIndex: number, forStudentId?: string) {
  const rows = await db.ownerReservation.findMany({
    where: { scheduleId, occurrenceDate, releasedAt: null, OR: [{ chunkIndex: null }, { chunkIndex }] },
  });
  if (rows.length === 0 || !forStudentId) return rows[0] ?? null;
  const user = await db.user.findUnique({ where: { id: forStudentId }, select: { email: true, emailVerified: true } });
  return rows.find((r) => !reservationIsFor(r.email, user)) ?? null;
}

export interface ReservationInput {
  name: string;
  email: string;
  phone: string;
  note?: string;
}

/** Checks the customer's details; returns an error line or null. */
export function validateReservationContact(input: ReservationInput): string | null {
  if (input.name.trim().split(/\s+/).filter(Boolean).length < 1 || input.name.trim().length < 2) return "Enter the customer's name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email.trim())) return "Enter a real email address.";
  if (input.phone.replace(/\D/g, "").length < 7) return "Enter the customer's phone number.";
  return null;
}
