import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ClassBookingError, todayBoundsEt } from "@/lib/classSchedule";
import { formatEtDateTime } from "@/lib/classScheduleLabels";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";

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
  classes: { id: string; scheduledAt: string; student: string }[];
}

/** What closing a day would cancel. Changes nothing. */
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
    classes: rows.map((r) => ({ id: r.id, scheduledAt: r.scheduledAt.toISOString(), student: r.student.name ?? r.student.email })),
  };
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
