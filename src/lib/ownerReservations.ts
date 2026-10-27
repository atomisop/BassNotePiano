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

/** The live reservation that keeps this class, if any. */
export async function findOwnerReservation(db: Db, scheduleId: string, occurrenceDate: Date, chunkIndex: number) {
  return db.ownerReservation.findFirst({
    where: { scheduleId, occurrenceDate, releasedAt: null, OR: [{ chunkIndex: null }, { chunkIndex }] },
  });
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
