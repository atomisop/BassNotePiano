import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { adjustUserCredits } from "@/lib/creditAdjustments";
import { markAttendance } from "@/lib/classScheduleAdmin";
import {
  adminBookClass,
  adminBookClassAtTime,
  ClassBookingError,
  getEffectiveClassCredits,
  NoFreeCreditError,
  ONE_OFF_LABEL,
  parseCustomTime,
  PlanHoldError,
} from "@/lib/classSchedule";
import { reservationIsFor } from "@/lib/ownerReservations";
import { CREDITS_PER_CLASS, creditsLabelFromStored } from "@/lib/classCreditPricing";
import { formatEtDateTime } from "@/lib/classScheduleLabels";
import { creditShortMessage, firstNameOf } from "@/lib/adminBookingRules";

/**
 * The studio booking a class for a student from wherever it is (a student's page, Schedule > Reserved), in one step: any weekly
 * time or any typed day and time (made on the spot), a past time recorded as a class already taught, a plan's weekly time after a
 * yes, and, for the owner, the missing credit added first. Every refusal comes back as a sentence about the student, never "you".
 */

export type AdminBookTarget = { scheduleId: string; occurrenceDateMs: number; chunkIndex: number } | { date: string; time: string };

export interface AdminBookOptions {
  /** Book into a weekly time another student's plan keeps (the studio was asked first). */
  overridePlanHold?: boolean;
  /** Owner only: when the student has no free credit, add what the class needs first (the audited credit adjustment). */
  addCredit?: boolean;
}

export type AdminBookResult =
  | { ok: true; bookingId: string; scheduledAt: string; walkIn: boolean; creditsAdded: number }
  | { ok: false; error: string; planHold?: boolean; shortBy?: number; canAddCredit?: boolean };

export interface Actor {
  id: string;
  email: string | null;
}

/**
 * Owner only: adds what this student is short of one class (nothing when they already have it), through the same audited
 * adjustment as Add credits. Returns the stored units added. Throws ClassBookingError for anyone but the owner.
 */
export async function topUpForOneClass(actor: Actor, studentId: string): Promise<number> {
  if (!isOwnerEmail(actor.email)) throw new ClassBookingError("Only the owner can add credits.");
  const shortBy = CREDITS_PER_CLASS - (await getEffectiveClassCredits(studentId));
  if (shortBy <= 0) return 0;
  const note = "Added by the studio to book a class";
  await adjustUserCredits(actor.id, studentId, shortBy, note);
  await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "credits.grant", targetType: "User", targetId: studentId, detail: `+${shortBy}. ${note}` });
  return shortBy;
}

/** The refusal for a student with no free credit, worded for the studio, with what the owner's "Add 1 credit" button needs. */
export async function creditShortResult(actor: Actor, studentId: string, err: NoFreeCreditError): Promise<{ ok: false; error: string; shortBy: number; canAddCredit: boolean }> {
  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { name: true, email: true } });
  const canAddCredit = isOwnerEmail(actor.email);
  const first = student ? firstNameOf(student) : "The student";
  return { ok: false, error: creditShortMessage(first, err.available, err.needed, canAddCredit), shortBy: err.needed - err.available, canAddCredit };
}

/** Books one class for a student on the studio's say. See the file header for what it covers. */
export async function adminBookForStudent(actor: Actor, studentId: string, target: AdminBookTarget, options: AdminBookOptions = {}, audit: { action?: string; detail?: string } = {}): Promise<AdminBookResult> {
  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, bannedAt: true } });
  if (!student) return { ok: false, error: "That account no longer exists." };
  if (student.bannedAt) return { ok: false, error: "That account is banned, so it cannot be booked." };

  let creditsAdded = 0;
  if (options.addCredit) {
    try {
      creditsAdded = await topUpForOneClass(actor, studentId);
    } catch (err) {
      if (err instanceof ClassBookingError) return { ok: false, error: err.message };
      throw err;
    }
  }

  const overridePlanHold = Boolean(options.overridePlanHold);
  try {
    if ("date" in target) {
      const booking = await adminBookClassAtTime(studentId, target.date, target.time, { overridePlanHold });
      const walkIn = booking.scheduledAt.getTime() <= Date.now();
      // A class already taught: record it as attended now, which uses the credit, as marking it on the day would have.
      if (walkIn) await markAttendance(booking.id, "PRESENT");
      await logAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        action: audit.action ?? (walkIn ? "booking.walk-in" : "booking.book-custom"),
        targetType: "User",
        targetId: studentId,
        detail: audit.detail ?? `${formatEtDateTime(booking.scheduledAt)}${walkIn ? ", marked Present" : ""}${overridePlanHold ? " (over a plan's weekly time)" : ""}`,
      });
      return { ok: true, bookingId: booking.id, scheduledAt: booking.scheduledAt.toISOString(), walkIn, creditsAdded };
    }
    const booking = await adminBookClass(studentId, target.scheduleId, target.occurrenceDateMs, target.chunkIndex, undefined, { overridePlanHold });
    await logAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: audit.action ?? (overridePlanHold ? "booking.book-over-plan-hold" : "booking.book"),
      targetType: "User",
      targetId: studentId,
      detail: audit.detail ?? formatEtDateTime(booking.scheduledAt),
    });
    return { ok: true, bookingId: booking.id, scheduledAt: booking.scheduledAt.toISOString(), walkIn: false, creditsAdded };
  } catch (err) {
    if (err instanceof NoFreeCreditError) return creditShortResult(actor, studentId, err);
    const added = creditsAdded > 0 ? `${creditsLabelFromStored(creditsAdded)} was added, but the class was not booked. ` : "";
    if (err instanceof PlanHoldError) return { ok: false, error: `${added}${err.message}`, planHold: true };
    if (err instanceof ClassBookingError) return { ok: false, error: `${added}${err.message}` };
    throw err;
  }
}

/**
 * "Book it" on Schedule > Reserved: books the customer's own account (the one whose verified email the owner typed) into one hour
 * of the time kept for them, with the same rules as any studio booking. The reservation is released as the class lands.
 */
export async function bookReservedHour(actor: Actor, groupId: string, scheduleId: string, chunkIndex: number, options: Pick<AdminBookOptions, "addCredit"> = {}): Promise<AdminBookResult> {
  const row = await prisma.ownerReservation.findFirst({
    where: { groupId, scheduleId, releasedAt: null, OR: [{ chunkIndex: null }, { chunkIndex }] },
    include: { schedule: true },
  });
  if (!row) return { ok: false, error: "That reservation was already released." };
  const account = await prisma.user.findFirst({ where: { email: { equals: row.email.trim(), mode: "insensitive" } }, select: { id: true, email: true, emailVerified: true } });
  if (!account) return { ok: false, error: "No account uses that email yet." };
  if (!reservationIsFor(row.email, account)) return { ok: false, error: "Their email is not verified yet, so the time cannot be booked for them." };

  const day = row.occurrenceDate.toISOString().slice(0, 10);
  // A time kept on a day with no weekly times lives on the hidden one-off schedule: book it by its date and start time.
  const oneOff = row.schedule.label === ONE_OFF_LABEL && !row.schedule.active;
  const target: AdminBookTarget = oneOff ? { date: day, time: row.schedule.startTime } : { scheduleId, occurrenceDateMs: row.occurrenceDate.getTime(), chunkIndex };
  // A kept time that has passed is not booked from here (that would record a class as taught).
  if (oneOff && (parseCustomTime(day, row.schedule.startTime)?.scheduledAt.getTime() ?? 0) <= Date.now()) return { ok: false, error: "That time has already passed." };
  return adminBookForStudent(actor, account.id, target, { addCredit: options.addCredit }, { action: "reservation.book", detail: `${row.name}, kept ${day}` });
}
