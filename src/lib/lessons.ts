import type { LessonType, LessonBookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { calculateLessonTotal } from "@/lib/lessonPricing";

export { LESSON_PRICE_CENTS, LESSON_DISCOUNT_RATE, calculateLessonTotal, type LessonTotal } from "@/lib/lessonPricing";

export interface LessonCredits {
  online: number;
  inPerson: number;
}

export async function getLessonCredits(userId: string): Promise<LessonCredits> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { lessonCreditsOnline: true, lessonCreditsInPerson: true },
  });
  return { online: user.lessonCreditsOnline, inPerson: user.lessonCreditsInPerson };
}

async function decrementCredit(studentId: string, type: LessonType): Promise<boolean> {
  // Guarded updateMany, not read-then-write — a double-submit can't push a
  // balance negative since the { gt: 0 } condition and the decrement happen
  // in the same atomic statement.
  const result =
    type === "ONLINE"
      ? await prisma.user.updateMany({
          where: { id: studentId, lessonCreditsOnline: { gt: 0 } },
          data: { lessonCreditsOnline: { decrement: 1 } },
        })
      : await prisma.user.updateMany({
          where: { id: studentId, lessonCreditsInPerson: { gt: 0 } },
          data: { lessonCreditsInPerson: { decrement: 1 } },
        });
  return result.count > 0;
}

async function refundCredit(studentId: string, type: LessonType): Promise<void> {
  await addLessonCredits(studentId, type, 1);
}

/** Called from approveZellePayment once a LESSON_PACKAGE payment verifies. */
export async function addLessonCredits(userId: string, type: LessonType, quantity: number): Promise<void> {
  if (type === "ONLINE") {
    await prisma.user.update({ where: { id: userId }, data: { lessonCreditsOnline: { increment: quantity } } });
  } else {
    await prisma.user.update({ where: { id: userId }, data: { lessonCreditsInPerson: { increment: quantity } } });
  }
}

/**
 * Logs a lesson request and spends one credit. scheduledAt is what the
 * student asked for, not a confirmed slot — there's no instructor-
 * availability system in this app, so the admin follows up out-of-band
 * (phone/email, same as every other manual review flow here) to actually
 * lock in the time.
 */
export async function createLessonBooking(studentId: string, type: LessonType, scheduledAt: Date, notes?: string) {
  if (scheduledAt.getTime() < Date.now()) {
    throw new Error("Pick a date and time in the future.");
  }

  const spent = await decrementCredit(studentId, type);
  if (!spent) {
    throw new Error(`You don't have any ${type === "ONLINE" ? "online" : "in-person"} lesson credits left.`);
  }

  const booking = await prisma.lessonBooking.create({
    data: { studentId, type, scheduledAt, notes: notes?.trim() || null },
  });

  const [student, admins] = await Promise.all([
    prisma.user.findUnique({ where: { id: studentId }, select: { name: true, username: true } }),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } }),
  ]);

  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: "LESSON_BOOKING_RECEIVED",
        title: "New lesson booking",
        body: `${student?.name ?? (student?.username ? `@${student.username}` : "A student")} requested a${
          type === "ONLINE" ? "n online" : "n in-person"
        } lesson for ${scheduledAt.toLocaleString()}.`,
        emailCategory: "social",
      }),
    ),
  );

  return booking;
}

export async function cancelLessonBooking(bookingId: string, reason?: string) {
  const booking = await prisma.lessonBooking.findUniqueOrThrow({ where: { id: bookingId } });
  if (booking.status !== "SCHEDULED") {
    throw new Error(`Booking ${bookingId} is not scheduled (status: ${booking.status})`);
  }

  const updated = await prisma.lessonBooking.update({
    where: { id: bookingId },
    data: { status: "CANCELED", canceledReason: reason ?? null },
  });

  await refundCredit(booking.studentId, booking.type);

  await createNotification({
    userId: booking.studentId,
    type: "LESSON_BOOKING_CANCELED",
    title: "Lesson booking canceled",
    body: `Your ${booking.type === "ONLINE" ? "online" : "in-person"} lesson request for ${booking.scheduledAt.toLocaleString()} was canceled${reason ? `: ${reason}.` : "."} Your credit has been refunded.`,
    emailCategory: "social",
  });

  return updated;
}

export async function completeLessonBooking(bookingId: string) {
  const booking = await prisma.lessonBooking.findUniqueOrThrow({ where: { id: bookingId } });
  if (booking.status !== "SCHEDULED") {
    throw new Error(`Booking ${bookingId} is not scheduled (status: ${booking.status})`);
  }
  return prisma.lessonBooking.update({ where: { id: bookingId }, data: { status: "COMPLETED" } });
}

export async function getUserBookings(studentId: string) {
  return prisma.lessonBooking.findMany({ where: { studentId }, orderBy: { scheduledAt: "desc" } });
}

export async function getAdminBookings(status?: LessonBookingStatus) {
  return prisma.lessonBooking.findMany({
    where: status ? { status } : undefined,
    orderBy: { scheduledAt: "asc" },
    include: { student: { select: { id: true, name: true, image: true, username: true, email: true } } },
  });
}

export type AdminLessonBooking = Awaited<ReturnType<typeof getAdminBookings>>[number];
