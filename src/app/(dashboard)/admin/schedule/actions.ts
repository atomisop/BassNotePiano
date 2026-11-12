"use server";

import { withStudentNotice } from "@/lib/notifyScope";
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
import { adminBookClass, rescheduleClassBooking, getUpcomingOccurrences, ClassBookingError, NoFreeCreditError, PlanHoldError } from "@/lib/classSchedule";
import { adminBookForStudent, bookReservedHour, creditShortResult, topUpForOneClass, type AdminBookResult } from "@/lib/adminBooking";
import { runOnce } from "@/lib/idempotency";
import { getActiveHolds } from "@/lib/contacts";
import { holdAppliesTo } from "@/lib/slotHolds";
import { markAttendance, undoAttendance, adminCancelClassBooking, setClassInPerson, getPendingAttendanceBookings, getBookingFeed, type PendingAttendanceRow, type BookingFeedRow } from "@/lib/classScheduleAdmin";
import { createClassSchedule, updateClassSchedule, setClassScheduleActive, ClassScheduleError, type ClassScheduleInput } from "@/lib/classScheduleManage";
import { searchStudentsForBooking, type BookableStudent } from "@/lib/admin";
import { createOwnerReservation, releaseOwnerReservation, getReservableHours, type ReservableHour } from "@/lib/ownerReservationsAdmin";
import { logAudit } from "@/lib/audit";
import { cancelUpcomingClasses, closeStudioDay, previewClosedDay, type ClosedDayPreview } from "@/lib/adminClassTools";
import { sendReservationEmail } from "@/lib/email";
import { reportError } from "@/lib/reportError";
import { rotateTeacherCalendarVersion } from "@/lib/teacherCalendar";
import { BookingRequestError, confirmBookingRequest, declineBookingRequest } from "@/lib/bookingRequests";

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
  const admin = await requireAdmin();
  const canceled = await setClassScheduleActive(scheduleId, active, { cancelUpcoming });
  await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "schedule.active", targetType: "ClassSchedule", targetId: scheduleId, detail: `${active ? "Turned on" : "Turned off"} a weekly time${cancelUpcoming ? `, canceled ${typeof canceled === "number" ? canceled : "its"} upcoming classes` : ""}` }).catch(() => undefined);
  revalidatePath("/", "layout");
  return { ok: true as const, canceled };
}

// Moved here from the old, now-removed /admin/bookings route, folded into
// Schedule as its "Bookings & attendance" tab instead of its own top-level
// nav slot, by direct instruction: both act on the exact same weekly-
// schedule data, one defining it, the other operating on it day to day.
export async function markAttendanceAction(bookingId: string, attendance: AttendanceStatus, notify = true) {
  return withStudentNotice(notify, async () => {
    await requireAdmin();
    await markAttendance(bookingId, attendance);
    revalidatePath("/", "layout");
  });
}

/**
 * Full reversal of a mistaken attendance mark, refunds the credit, not
 * just correcting Present vs. No-show (re-calling markAttendanceAction
 * above already does that safely, with no credit change either way). By
 * direct instruction: marking attendance charges a real credit, so it
 * needed a genuine undo, not just a re-pick.
 */
export async function undoAttendanceAction(bookingId: string, notify = true) {
  return withStudentNotice(notify, async () => {
    await requireAdmin();
    try {
      await undoAttendance(bookingId);
      revalidatePath("/", "layout");
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
    }
  });
}

/** Feeds the TopBar's class-bookings panel: every active booking, soonest first. */
export async function getBookingFeedAction(): Promise<BookingFeedRow[]> {
  await requireAdmin();
  await bookMissingReservedWindows();
  return getBookingFeed();
}

export async function adminCancelBookingAction(bookingId: string, reason?: string, notify = true) {
  return withStudentNotice(notify, async () => {
    await requireAdmin();
    try {
      await adminCancelClassBooking(bookingId, reason);
      revalidatePath("/", "layout");
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
    }
  });
}

/**
 * What the Move and Book calendars show: the open weekly times, and every class already booked over the next year
 * (so a custom time can be chosen around them). Fetched when a picker opens so the student page itself loads faster.
 * With `studentId` the times are read as that student sees them: a time the owner kept for them is open (`reservedForThem`),
 * and their own plan's time is theirs. A contact's soft hold is named on its time (`heldFor`) so the studio is asked first.
 */
export async function getOpenSlotsAction(studentId?: string) {
  await requireAdmin();
  const viewerId = typeof studentId === "string" && studentId ? studentId : undefined;
  const [upcoming, booked, windows, holds, student] = await Promise.all([
    getUpcomingOccurrences(viewerId, { forAdmin: true }),
    prisma.classBooking.findMany({
      // From 180 days back (a class can be rescheduled into the past, and past classes may be marked already) to a year ahead.
      where: { status: { in: ["SCHEDULED", "COMPLETED"] }, scheduledAt: { gte: new Date(Date.now() - 180 * 86_400_000), lte: new Date(Date.now() + 400 * 86_400_000) } },
      select: { id: true, scheduledAt: true, student: { select: { name: true, email: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 3000,
    }),
    prisma.classSchedule.findMany({ where: { active: true }, select: { dayOfWeek: true } }),
    getActiveHolds(),
    viewerId ? prisma.user.findUnique({ where: { id: viewerId }, select: { email: true } }) : null,
  ]);
  // A hold kept for this very person (their contact has the account's email) is theirs: no question.
  const holdContacts = holds.length > 0 && student ? await prisma.contact.findMany({ where: { id: { in: holds.map((h) => h.contactId) } }, select: { id: true, email: true } }) : [];
  const ownContacts = new Set(holdContacts.filter((c) => c.email && student && c.email.toLowerCase() === student.email.toLowerCase()).map((c) => c.id));
  const heldFor = (o: { scheduleId: string; chunkIndex: number; occurrenceDate: Date }) =>
    holds.find(
      (h) =>
        !ownContacts.has(h.contactId) &&
        h.scheduleId === o.scheduleId &&
        h.chunkIndex === o.chunkIndex &&
        holdAppliesTo({ until: h.untilMs === null ? null : new Date(h.untilMs), releasedAt: null }, o.occurrenceDate),
    )?.contactName;
  const slot = (o: (typeof upcoming)[number]) => ({
    scheduleId: o.scheduleId,
    occurrenceDateMs: o.occurrenceDate.getTime(),
    chunkIndex: o.chunkIndex,
    label: o.label,
    scheduledAt: o.scheduledAt.toISOString(),
    creditCost: o.creditCost,
    ...(o.reservedForYou ? { reservedForThem: true } : {}),
    ...(heldFor(o) ? { heldFor: heldFor(o) } : {}),
  });
  return {
    /** The weekdays the studio teaches (an active weekly window exists), so the calendar marks the others as days off. */
    weekdays: Array.from(new Set(windows.map((w) => w.dayOfWeek))),
    open: upcoming.filter((o) => !o.isBooked && !o.heldByPlan).map(slot),
    /** Free of classes but kept by another student's weekly plan (a paused plan, a canceled week). Offered with a confirmation. */
    held: upcoming.filter((o) => !o.isBooked && o.heldByPlan).map((o) => ({ ...slot(o), heldBy: o.heldByPlan as string })),
    booked: booked.map((b) => ({ id: b.id, scheduledAt: b.scheduledAt.toISOString(), name: b.student.name ?? b.student.email })),
  };
}

type BookOpts = { overridePlanHold?: boolean; addCredit?: boolean; key?: string };
const BUSY: AdminBookResult = { ok: false, error: "Already working on it." };

/** Runs one studio booking once per tap (a double tap gets the first answer), then refreshes every screen. */
async function bookOnce(scope: string, key: string | undefined, work: (admin: { id: string; email: string | null }) => Promise<AdminBookResult>): Promise<AdminBookResult> {
  const admin = await requireAdmin();
  const actor = { id: admin.id, email: admin.email ?? null };
  const result = await runOnce(actor.id, scope, key, () => work(actor), { isSuccess: (r) => r.ok, whileRunning: BUSY });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/**
 * Book a class on a student's page: one weekly time. `overridePlanHold` books over another plan's weekly time (asked first);
 * `addCredit` (owner only) adds the credit they are short, then books, as one step.
 */
export async function adminBookAtSlotAction(studentId: string, slot: { scheduleId: string; occurrenceDateMs: number; chunkIndex: number }, opts: BookOpts = {}, notify = true): Promise<AdminBookResult> {
  return withStudentNotice(notify, () =>
    bookOnce(`admin-book:${studentId}`, opts.key, (actor) =>
      adminBookForStudent(actor, String(studentId), { scheduleId: String(slot.scheduleId), occurrenceDateMs: Number(slot.occurrenceDateMs), chunkIndex: Number(slot.chunkIndex) }, { overridePlanHold: Boolean(opts.overridePlanHold), addCredit: Boolean(opts.addCredit) }),
    ),
  );
}

/**
 * Book a class at any date and start time (ET) the studio types, made on the spot like Reschedule's typed time. A time already
 * past records a class already taught: it is booked and marked Present in one step.
 */
export async function adminBookClassAtTimeAction(studentId: string, date: string, time: string, opts: BookOpts = {}, notify = true): Promise<AdminBookResult> {
  return withStudentNotice(notify, () =>
    bookOnce(`admin-book:${studentId}`, opts.key, (actor) =>
      adminBookForStudent(actor, String(studentId), { date: String(date), time: String(time) }, { overridePlanHold: Boolean(opts.overridePlanHold), addCredit: Boolean(opts.addCredit) }),
    ),
  );
}

/** "Book it" on Schedule > Reserved: books the customer's account into one hour kept for them, and releases the reservation. */
export async function bookReservationAction(groupId: string, scheduleId: string, chunkIndex: number, opts: Pick<BookOpts, "addCredit" | "key"> = {}, notify = true): Promise<AdminBookResult> {
  return withStudentNotice(notify, () =>
    bookOnce(`reservation-book:${groupId}`, opts.key, (actor) => bookReservedHour(actor, String(groupId), String(scheduleId), Number(chunkIndex), { addCredit: Boolean(opts.addCredit) })),
  );
}

/**
 * Reschedule: moves a student's class to another open time in one step (the old class is freed and the new one booked together, or nothing
 * changes). Any class not yet marked Present or No-show can move, a past one too (`anyTime`).
 */
export async function adminMoveBookingAction(bookingId: string, scheduleId: string, occurrenceDateMs: number, chunkIndex: number, notify = true, overridePlanHold = false) {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    try {
      const booking = await prisma.classBooking.findUniqueOrThrow({ where: { id: bookingId }, select: { studentId: true } });
      await rescheduleClassBooking(booking.studentId, bookingId, scheduleId, occurrenceDateMs, chunkIndex, undefined, { byAdmin: true, anyTime: true, overridePlanHold });
      if (overridePlanHold) await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "booking.move-over-plan-hold", targetType: "ClassBooking", targetId: bookingId, detail: "Moved into a weekly time another plan keeps" });
      revalidatePath("/", "layout");
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong.", planHold: err instanceof PlanHoldError };
    }
  });
}

/** Reschedule to any date and start time (ET), past or future, as long as its 45 minutes overlap no other class. */
export async function adminMoveBookingToTimeAction(bookingId: string, date: string, time: string, notify = true, overridePlanHold = false) {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    try {
      const booking = await prisma.classBooking.findUniqueOrThrow({ where: { id: bookingId }, select: { studentId: true } });
      await rescheduleClassBooking(booking.studentId, bookingId, "", 0, 0, undefined, { byAdmin: true, anyTime: true, customTime: { date, time }, overridePlanHold });
      await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "booking.move-custom", targetType: "ClassBooking", targetId: bookingId, detail: `${date} ${time} ET${overridePlanHold ? " (over a plan's weekly time)" : ""}` });
      revalidatePath("/", "layout");
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong.", planHold: err instanceof PlanHoldError };
    }
  });
}

/** The Online / In person switch on the attendance list. In person means no Discord call for that class. */
export async function setClassInPersonAction(bookingId: string, inPerson: boolean, notify = true) {
  return withStudentNotice(notify, async () => {
    await requireAdmin();
    try {
      await setClassInPerson(bookingId, inPerson);
      revalidatePath("/", "layout");
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
    }
  });
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
  notify = true,
) {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    try {
      await adminBookClass(studentId, scheduleId, occurrenceDateMs, chunkIndex, creditsToBook);
      revalidatePath("/", "layout");
      return { ok: true as const };
    } catch (err) {
      // Worded for the studio ("Sam has no free credit"), not for the student.
      if (err instanceof NoFreeCreditError) return creditShortResult({ id: admin.id, email: admin.email ?? null }, studentId, err);
      return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
    }
  });
}

/** Owner only: the old teacher calendar link stops working and a new one is shown (calendar apps need the new link added again). */
export async function rotateTeacherCalendarLinkAction(): Promise<void> {
  const session = await getServerAuthSession();
  if (!session?.user || session.user.role !== "ADMIN" || !isOwnerEmail(session.user.email)) return;
  await rotateTeacherCalendarVersion();
  await logAudit({ actorId: session.user.id, actorEmail: session.user.email ?? null, action: "calendar.reset", targetType: "Calendar", detail: "Teacher calendar link replaced" });
  revalidatePath("/admin/schedule");
}

/**
 * Request mode: books the requested time for the student and answers the others who asked for it. When the student has no free
 * credit the answer names them, and the owner can send `addCredit` to add the credit and confirm in one step.
 */
export async function confirmBookingRequestAction(
  requestId: string,
  opts: { addCredit?: boolean; key?: string } = {},
): Promise<{ ok: true } | { ok: false; error: string; shortBy?: number; canAddCredit?: boolean }> {
  const admin = await requireAdmin();
  const actor = { id: admin.id, email: admin.email ?? null };
  type Answer = { ok: true } | { ok: false; error: string; shortBy?: number; canAddCredit?: boolean };
  const result = await runOnce<Answer>(
    actor.id,
    `confirm-request:${requestId}`,
    opts.key,
    async () => {
      const request = await prisma.bookingRequest.findUnique({ where: { id: String(requestId) }, select: { studentId: true, status: true } });
      try {
        if (opts.addCredit && request?.status === "PENDING") await topUpForOneClass(actor, request.studentId);
        await confirmBookingRequest(String(requestId), admin.id);
        return { ok: true };
      } catch (err) {
        if (err instanceof NoFreeCreditError && request) return creditShortResult(actor, request.studentId, err);
        return { ok: false, error: err instanceof BookingRequestError || err instanceof ClassBookingError ? err.message : "Something went wrong." };
      }
    },
    { isSuccess: (r) => r.ok, whileRunning: { ok: false, error: "Already working on it." } },
  );
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function declineBookingRequestAction(requestId: string, reason?: string) {
  const admin = await requireAdmin();
  try {
    await declineBookingRequest(requestId, admin.id, reason);
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof BookingRequestError ? err.message : "Something went wrong." };
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
  /** "HH:mm": one class at this start on a day with no weekly times (the owner said yes to using it). */
  time?: string;
}): Promise<{ ok: true; emailed: boolean } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  try {
    const result = await createOwnerReservation(admin.id, { ...input, time: input.time ? String(input.time) : undefined });
    await logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "reservation.create",
      targetType: "OwnerReservation",
      targetId: result.groupId,
      detail: `${input.date}${input.time ? ` at ${input.time} (not a usual teaching day)` : ""} for ${input.name.trim()}`,
    });
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

/** Cancels every upcoming class of one student, with one notice for all of them. */
export async function cancelUpcomingClassesAction(userId: string, reason: string, notify = true): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    try {
      const count = await cancelUpcomingClasses(admin.id, String(userId), String(reason ?? "").slice(0, 200));
      revalidatePath("/", "layout");
      return { ok: true as const, count };
    } catch (err) {
      if (err instanceof ClassBookingError) return { ok: false as const, error: err.message };
      throw err;
    }
  });
}

/** What closing a day would cancel. Changes nothing. */
export async function previewClosedDayAction(date: string): Promise<{ ok: true; preview: ClosedDayPreview } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    return { ok: true, preview: await previewClosedDay(String(date)) };
  } catch (err) {
    if (err instanceof ClassBookingError) return { ok: false, error: err.message };
    throw err;
  }
}

/** Closes the studio for a day: cancels its classes (each student told once) and keeps the day free of new bookings. */
export async function closeStudioDayAction(date: string, reason: string, notify = true): Promise<{ ok: true; canceled: number; label: string } | { ok: false; error: string }> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    try {
      const result = await closeStudioDay(admin.id, admin.email ?? "", String(date), String(reason ?? "").slice(0, 200));
      revalidatePath("/", "layout");
      return { ok: true as const, ...result };
    } catch (err) {
      if (err instanceof ClassBookingError) return { ok: false as const, error: err.message };
      throw err;
    }
  });
}
