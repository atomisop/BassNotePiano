"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AttendanceStatus } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { bookMissingReservedWindows } from "@/lib/paymentPlans";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { checkBotSetup, createLingeringTestChannel, isGuildMember, TEST_CHANNEL_KEY, type SetupCheck } from "@/lib/discordApi";
import { discordChannelUrl } from "@/lib/discord";
import { prisma } from "@/lib/prisma";
import { getNumberSetting } from "@/lib/siteSettings";
import { adminBookClass, rescheduleClassBooking, getUpcomingOccurrences, ClassBookingError } from "@/lib/classSchedule";
import { markAttendance, undoAttendance, adminCancelClassBooking, setClassInPerson, getPendingAttendanceBookings, getBookingFeed, type PendingAttendanceRow, type BookingFeedRow } from "@/lib/classScheduleAdmin";
import { createClassSchedule, updateClassSchedule, setClassScheduleActive, ClassScheduleError, type ClassScheduleInput } from "@/lib/classScheduleManage";
import { searchStudentsForBooking, type BookableStudent } from "@/lib/admin";
import { createOwnerReservation, releaseOwnerReservation, getReservableHours, type ReservableHour } from "@/lib/ownerReservationsAdmin";
import { logAudit } from "@/lib/audit";
import { sendReservationEmail } from "@/lib/email";
import { reportError } from "@/lib/reportError";

async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/schedule");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

export async function createClassScheduleAction(input: ClassScheduleInput) {
  await requireAdmin();
  try {
    await createClassSchedule(input);
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassScheduleError ? err.message : "Something went wrong." };
  }
}

export async function updateClassScheduleAction(scheduleId: string, input: ClassScheduleInput) {
  await requireAdmin();
  try {
    await updateClassSchedule(scheduleId, input);
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassScheduleError ? err.message : "Something went wrong." };
  }
}

export async function setClassScheduleActiveAction(scheduleId: string, active: boolean, cancelUpcoming = false) {
  await requireAdmin();
  const canceled = await setClassScheduleActive(scheduleId, active, { cancelUpcoming });
  revalidatePath("/", "layout");
  return { ok: true as const, canceled };
}

// Moved here from the old, now-removed /admin/bookings route, folded into
// Schedule as its "Bookings & attendance" tab instead of its own top-level
// nav slot, by direct instruction: both act on the exact same weekly-
// schedule data, one defining it, the other operating on it day to day.
export async function markAttendanceAction(bookingId: string, attendance: AttendanceStatus) {
  await requireAdmin();
  await markAttendance(bookingId, attendance);
  revalidatePath("/", "layout");
}

/**
 * Full reversal of a mistaken attendance mark, refunds the credit, not
 * just correcting Present vs. No-show (re-calling markAttendanceAction
 * above already does that safely, with no credit change either way). By
 * direct instruction: marking attendance charges a real credit, so it
 * needed a genuine undo, not just a re-pick.
 */
export async function undoAttendanceAction(bookingId: string) {
  await requireAdmin();
  try {
    await undoAttendance(bookingId);
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
  }
}

/** Feeds the TopBar's class-bookings panel: every active booking, soonest first. */
export async function getBookingFeedAction(): Promise<BookingFeedRow[]> {
  await requireAdmin();
  await bookMissingReservedWindows();
  return getBookingFeed();
}

export async function adminCancelBookingAction(bookingId: string, reason?: string) {
  await requireAdmin();
  try {
    await adminCancelClassBooking(bookingId, reason);
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
  }
}

/**
 * What the Move and Book calendars show: the open weekly times, and every class already booked over the next year
 * (so a custom time can be chosen around them). Fetched when a picker opens so the student page itself loads faster.
 */
export async function getOpenSlotsAction() {
  await requireAdmin();
  const [upcoming, booked, windows] = await Promise.all([
    getUpcomingOccurrences(),
    prisma.classBooking.findMany({
      where: { status: "SCHEDULED", scheduledAt: { gte: new Date(), lte: new Date(Date.now() + 400 * 86_400_000) } },
      select: { id: true, scheduledAt: true, student: { select: { name: true, email: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 1000,
    }),
    prisma.classSchedule.findMany({ where: { active: true }, select: { dayOfWeek: true } }),
  ]);
  return {
    /** The weekdays the studio teaches (an active weekly window exists), so the calendar lights only those days. */
    weekdays: Array.from(new Set(windows.map((w) => w.dayOfWeek))),
    open: upcoming
      .filter((o) => !o.isBooked)
      .map((o) => ({ scheduleId: o.scheduleId, occurrenceDateMs: o.occurrenceDate.getTime(), chunkIndex: o.chunkIndex, label: o.label, scheduledAt: o.scheduledAt.toISOString(), creditCost: o.creditCost })),
    booked: booked.map((b) => ({ id: b.id, scheduledAt: b.scheduledAt.toISOString(), name: b.student.name ?? b.student.email })),
  };
}

/** Moves a student's class to another open time in one step: the old class is freed and the new one booked together, or nothing changes. */
export async function adminMoveBookingAction(bookingId: string, scheduleId: string, occurrenceDateMs: number, chunkIndex: number) {
  await requireAdmin();
  try {
    const booking = await prisma.classBooking.findUniqueOrThrow({ where: { id: bookingId }, select: { studentId: true } });
    await rescheduleClassBooking(booking.studentId, bookingId, scheduleId, occurrenceDateMs, chunkIndex, undefined, { byAdmin: true });
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
  }
}

/** Moves a class to any future date and start time (ET), as long as its 45 minutes overlap no other class. */
export async function adminMoveBookingToTimeAction(bookingId: string, date: string, time: string) {
  const admin = await requireAdmin();
  try {
    const booking = await prisma.classBooking.findUniqueOrThrow({ where: { id: bookingId }, select: { studentId: true } });
    await rescheduleClassBooking(booking.studentId, bookingId, "", 0, 0, undefined, { byAdmin: true, customTime: { date, time } });
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "booking.move-custom", targetType: "ClassBooking", targetId: bookingId, detail: `${date} ${time} ET` });
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
  }
}

/** The Online / In person switch on the attendance list. In person means no Discord call for that class. */
export async function setClassInPersonAction(bookingId: string, inPerson: boolean) {
  await requireAdmin();
  try {
    await setClassInPerson(bookingId, inPerson);
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
  }
}

export async function searchStudentsForBookingAction(query: string): Promise<BookableStudent[]> {
  await requireAdmin();
  return searchStudentsForBooking(query);
}

export async function adminBookClassAction(
  studentId: string,
  scheduleId: string,
  occurrenceDateMs: number,
  chunkIndex: number,
  creditsToBook: number,
) {
  await requireAdmin();
  try {
    await adminBookClass(studentId, scheduleId, occurrenceDateMs, chunkIndex, creditsToBook);
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
  }
}

/** Owner only: checks every step the Discord bot needs, and makes then removes a test channel. */
export async function testDiscordBotAction(): Promise<{ ok: boolean; checks: SetupCheck[] }> {
  const session = await getServerAuthSession();
  if (!session?.user || session.user.role !== "ADMIN" || !isOwnerEmail(session.user.email)) {
    return { ok: false, checks: [{ step: "Access", ok: false, detail: "Only the owner can run this." }] };
  }
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { discordId: true } });
  const checks = await checkBotSetup(me?.discordId ?? null);
  return { ok: checks.every((c) => c.ok), checks };
}

/** Owner only: makes a private test call that stays for ten minutes, so it can be seen in Discord. */
export async function createVisibleTestChannelAction(): Promise<{ ok: boolean; message: string; url: string | null }> {
  const session = await getServerAuthSession();
  if (!session?.user || session.user.role !== "ADMIN" || !isOwnerEmail(session.user.email)) {
    return { ok: false, message: "Only the owner can run this.", url: null };
  }
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { discordId: true } });
  if (!me?.discordId) return { ok: false, message: "Connect your Discord first.", url: null };
  try {
    if (!(await isGuildMember(me.discordId))) return { ok: false, message: "Your connected Discord account is not in the server.", url: null };
    const minutes = await getNumberSetting("discord.testChannelMinutes");
    const id = await createLingeringTestChannel(me.discordId, async (value) => {
      await prisma.appSetting.upsert({ where: { key: TEST_CHANNEL_KEY }, update: { value }, create: { key: TEST_CHANNEL_KEY, value } });
    }, minutes);
    return { ok: true, message: `Created. Look in the Live Classes category in Discord. It is removed in ${minutes} minutes.`, url: discordChannelUrl(id) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message.slice(0, 200) : "Something went wrong.", url: null };
  }
}

/** The hours the studio offers right now, read from the database, so the form never works from a copy of the page the browser kept. */
export async function getReservableHoursAction(): Promise<ReservableHour[]> {
  await requireAdmin();
  return getReservableHours();
}

/** Keeps a day (or some hours of it) for a named customer so nobody can book it. */
export async function reserveForCustomerAction(input: {
  date: string;
  hours: { scheduleId: string; chunkIndex: number }[] | null;
  name: string;
  email: string;
  phone: string;
  note?: string;
}): Promise<{ ok: true; emailed: boolean } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  try {
    const result = await createOwnerReservation(admin.id, input);
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "reservation.create", targetType: "OwnerReservation", targetId: result.groupId, detail: `${input.date} for ${input.name.trim()}` });
    revalidatePath("/", "layout");
    // Tell the customer. A failed email never undoes the reservation: the owner is told so they can reach out themselves.
    let emailed = true;
    try {
      const to = input.email.trim().toLowerCase();
      const account = await prisma.user.findUnique({ where: { email: to }, select: { id: true } });
      await sendReservationEmail(to, { name: input.name, when: result.when, hasAccount: Boolean(account) });
    } catch (err) {
      emailed = false;
      reportError(err, "reservation email");
    }
    return { ok: true, emailed };
  } catch (err) {
    return { ok: false, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
  }
}

export async function releaseReservationAction(groupId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const count = await releaseOwnerReservation(groupId);
  if (count === 0) return { ok: false, error: "That reservation was already released." };
  await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "reservation.release", targetType: "OwnerReservation", targetId: groupId });
  revalidatePath("/", "layout");
  return { ok: true };
}
