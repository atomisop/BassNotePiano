import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ClassBookingError, parseCustomTime, rescheduleClassBooking, todayBoundsEt } from "@/lib/classSchedule";
import { formatEtDateTime } from "@/lib/classScheduleLabels";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { withStudentNotice } from "@/lib/notifyScope";
import { checkDayMoves, type DayMove } from "@/lib/weeklyTimeRules";

/**
 * Class fixes in bulk: cancel every upcoming class of one student at once, and close the studio for a day (every class that day is
 * canceled, and the day is kept so nobody books it until it is released on Schedule > Reserved). Credits are never charged for a
 * canceled class, and a weekly plan does not book a canceled week again.
 */

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const CLOSED_NAME = "Studio closed";

/** Cancels every class the student has booked from now on. One notice lists them, instead of one per class. */
export async function cancelUpcomingClasses(adminId: string, userId: string, reason: string): Promise<number> {
  const note = reason.trim() || "Canceled by the studio";
  const rows = await prisma.classBooking.findMany({ where: { studentId: userId, status: "SCHEDULED", scheduledAt: { gt: new Date() } }, orderBy: { scheduledAt: "asc" }, select: { id: true, scheduledAt: true } });
  if (rows.length === 0) throw new ClassBookingError("There are no upcoming classes to cancel.");
  await prisma.classBooking.updateMany({ where: { id: { in: rows.map((r) => r.id) }, status: "SCHEDULED" }, data: { status: "CANCELED", refunded: true, canceledReason: note } });
  const list = rows.slice(0, 6).map((r) => formatEtDateTime(r.scheduledAt)).join(", ") + (rows.length > 6 ? ` and ${rows.length - 6} more` : "");
  await createNotification({
    userId,
    type: "LESSON_BOOKING_CANCELED",
    title: rows.length === 1 ? "Class canceled" : `${rows.length} classes canceled`,
    body: `The studio canceled your upcoming ${rows.length === 1 ? "class" : "classes"} (${note}): ${list}. No credits were charged.`,
    emailCategory: "classes",
  }).catch(() => undefined);
  await logAudit({ actorId: adminId, action: "booking.cancel-all", targetType: "User", targetId: userId, detail: `Canceled ${rows.length} upcoming classes: ${note}` }).catch(() => undefined);
  return rows.length;
}

/** "2026-11-26" to the UTC-midnight key ClassBooking.occurrenceDate uses, or null. */
function dayKey(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date ? null : d;
}

export interface ClosedDayPreview {
  label: string;
  classes: { id: string; scheduledAt: string; student: string; /** Its Eastern start, "HH:mm", so a move can keep the same time on another day. */ time: string }[];
}

const etClock = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** What closing a day would cancel (or move). Changes nothing. */
export async function previewClosedDay(date: string): Promise<ClosedDayPreview> {
  const day = dayKey(date);
  if (!day) throw new ClassBookingError("Pick a date.");
  const rows = await prisma.classBooking.findMany({
    where: { occurrenceDate: day, status: "SCHEDULED" },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, scheduledAt: true, student: { select: { name: true, email: true } } },
  });
  return {
    label: day.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }),
    classes: rows.map((r) => ({ id: r.id, scheduledAt: r.scheduledAt.toISOString(), student: r.student.name ?? r.student.email, time: etClock(r.scheduledAt) })),
  };
}

/**
 * "Move them instead" on Close a day: every class that day moves to the day and time chosen for it (another day at the same time, or a time
 * picked per class), through the studio's own Reschedule (any time, no charge), and the day is then closed like the plain close. Each
 * student is told once, in one notice listing where their class went. Stops at the first class that cannot move and says why; the classes
 * already moved stay moved (and are told), and the day is not closed until every class has moved.
 */
export async function moveClosedDayClasses(adminId: string, adminEmail: string, date: string, reason: string, moves: DayMove[]): Promise<{ moved: number; label: string }> {
  const day = dayKey(date);
  if (!day) throw new ClassBookingError("Pick a date.");
  if (day.getTime() < todayBoundsEt().start.getTime() - 86_400_000) throw new ClassBookingError("That day has already passed.");
  const note = reason.trim() || "The studio is closed that day";
  const bookings = await prisma.classBooking.findMany({ where: { occurrenceDate: day, status: "SCHEDULED" }, orderBy: { scheduledAt: "asc" }, select: { id: true, studentId: true, scheduledAt: true, student: { select: { name: true, email: true } } } });
  if (bookings.length === 0) throw new ClassBookingError("No classes are booked that day, so there is nothing to move.");
  const checked = checkDayMoves(date, bookings.map((b) => b.id), moves);
  if ("error" in checked) throw new ClassBookingError(checked.error);
  const label = day.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });

  const told = new Map<string, string[]>();
  let failure: string | null = null;
  let movedCount = 0;
  for (const m of checked.moves) {
    const b = bookings.find((x) => x.id === m.bookingId)!;
    try {
      // Quiet: the one notice per student below says where every class went.
      await withStudentNotice(false, () => rescheduleClassBooking(b.studentId, b.id, "", 0, 0, undefined, { byAdmin: true, anyTime: true, customTime: { date: m.date, time: m.time } }));
    } catch (err) {
      failure = `${b.student.name ?? b.student.email}'s ${formatEtDateTime(b.scheduledAt)} class: ${err instanceof Error ? err.message : "could not move"}`;
      break;
    }
    movedCount += 1;
    const to = parseCustomTime(m.date, m.time)?.scheduledAt;
    // A class moved into the past is the studio fixing its records: nothing for the student to act on.
    if (to && to.getTime() > Date.now()) told.set(b.studentId, [...(told.get(b.studentId) ?? []), `your ${formatEtDateTime(b.scheduledAt)} class moved to ${formatEtDateTime(to)}`]);
  }

  for (const [studentId, lines] of told) {
    await createNotification({
      userId: studentId,
      type: "LESSON_BOOKING_CANCELED",
      title: lines.length === 1 ? "Your class was moved" : "Your classes were moved",
      body: `The studio is closed on ${label} (${note}), so ${lines.join(", and ")}. No credits were charged.`,
      emailCategory: "classes",
      cta: { label: "See your classes", path: "/lessons" },
    }).catch(() => undefined);
  }
  if (failure) {
    await logAudit({ actorId: adminId, action: "studio.move-day", targetType: "Day", targetId: date, detail: `Moved ${movedCount} of ${checked.moves.length} classes off ${label}, then stopped: ${failure}` }).catch(() => undefined);
    throw new ClassBookingError(`${failure} ${movedCount > 0 ? `${movedCount} ${movedCount === 1 ? "class" : "classes"} before it moved. ` : ""}${label} is not closed yet: pick another time for that class and press Move again.`);
  }

  // Every class has moved: close the day so nobody books it (it is kept like a plain close, released under Reserved).
  const already = await prisma.ownerReservation.findFirst({ where: { occurrenceDate: day, name: CLOSED_NAME, releasedAt: null }, select: { id: true } });
  if (!already) await closeStudioDay(adminId, adminEmail, date, reason);
  await logAudit({ actorId: adminId, action: "studio.move-day", targetType: "Day", targetId: date, detail: `Moved ${checked.moves.length} classes off ${label} and closed it: ${note}` }).catch(() => undefined);
  return { moved: checked.moves.length, label };
}

/** Cancels every class on the day (each student told once) and keeps the whole day so nobody books it. */
export async function closeStudioDay(adminId: string, adminEmail: string, date: string, reason: string): Promise<{ canceled: number; label: string }> {
  const day = dayKey(date);
  if (!day) throw new ClassBookingError("Pick a date.");
  if (day.getTime() < todayBoundsEt().start.getTime() - 86_400_000) throw new ClassBookingError("That day has already passed.");
  const note = reason.trim() || "The studio is closed that day";
  const schedules = await prisma.classSchedule.findMany({ where: { active: true, dayOfWeek: day.getUTCDay() }, select: { id: true } });
  const already = await prisma.ownerReservation.findFirst({ where: { occurrenceDate: day, name: CLOSED_NAME, releasedAt: null }, select: { id: true } });
  const { label, classes } = await previewClosedDay(date);
  if (already && classes.length === 0) throw new ClassBookingError(`${label} is already closed.`);

  const bookings = await prisma.classBooking.findMany({ where: { occurrenceDate: day, status: "SCHEDULED" }, select: { id: true, studentId: true, scheduledAt: true } });
  await prisma.$transaction(async (tx) => {
    await tx.classBooking.updateMany({ where: { id: { in: bookings.map((b) => b.id) }, status: "SCHEDULED" }, data: { status: "CANCELED", refunded: true, canceledReason: note } });
    if (!already && schedules.length > 0) {
      const groupId = randomUUID();
      await tx.ownerReservation.createMany({
        data: schedules.map((s) => ({ groupId, scheduleId: s.id, occurrenceDate: day, chunkIndex: null, name: CLOSED_NAME, email: adminEmail.toLowerCase(), phone: "", note, createdById: adminId })),
      });
    }
  });
  for (const studentId of Array.from(new Set(bookings.map((b) => b.studentId)))) {
    const times = bookings.filter((b) => b.studentId === studentId).map((b) => formatEtDateTime(b.scheduledAt)).join(", ");
    await createNotification({
      userId: studentId,
      type: "LESSON_BOOKING_CANCELED",
      title: "Class canceled",
      body: `The studio is closed on ${label} (${note}), so your class at ${times} is canceled. No credits were charged.`,
      emailCategory: "classes",
    }).catch(() => undefined);
  }
  await logAudit({ actorId: adminId, action: "studio.close-day", targetType: "Day", targetId: date, detail: `Closed ${label}, ${bookings.length} classes canceled: ${note}` }).catch(() => undefined);
  return { canceled: bookings.length, label: label || DAYS[day.getUTCDay()] };
}
