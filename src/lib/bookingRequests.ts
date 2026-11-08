import { prisma } from "@/lib/prisma";
import { getBoolSetting } from "@/lib/siteSettings";
import { createNotification } from "@/lib/notifications";
import { getAppUrl, sendNotificationEmailWithCta } from "@/lib/email";
import { OWNER_EMAIL } from "@/lib/adminNotifications";
import { formatEtDateTime } from "@/lib/classScheduleLabels";
import { adminBookClass, ClassBookingError, getEffectiveClassCredits, livePaymentPlanConditions, resolveRequestedHour } from "@/lib/classSchedule";

/**
 * Booking by request. With Settings > Booking > "Students request times, I confirm" on, a student cannot book a time;
 * they ask for it. The teacher confirms (which books it with the same checks as any booking made for a student) or
 * declines. Several students can ask for the same hour: the earliest request is first in line, and confirming one
 * tells the others their request did not get that hour.
 */

export class BookingRequestError extends Error {}

/** Open requests one student can have at once, so the queue cannot be flooded. */
export const MAX_PENDING_REQUESTS = 6;

export function isRequestMode(): Promise<boolean> {
  return getBoolSetting("booking.requestMode");
}

export interface RequestSelection {
  scheduleId: string;
  occurrenceDateMs: number;
  chunkIndex: number;
}

export interface RequestResult {
  scheduleId: string;
  occurrenceDateMs: number;
  chunkIndex: number;
  ok: boolean;
  error?: string;
}

function slotLabel(scheduledAt: Date, label: string | null): string {
  return `${label ? `${label}, ` : ""}${formatEtDateTime(scheduledAt)} (US Eastern)`;
}

/** Sends the student's requests to the queue. Each time is checked on its own, so one bad pick does not sink the rest. */
export async function createBookingRequests(studentId: string, selections: RequestSelection[]): Promise<RequestResult[]> {
  if (!(await isRequestMode())) throw new BookingRequestError("Times are booked directly right now. Pick a time and book it.");
  if (selections.length === 0) throw new BookingRequestError("Pick at least one time first.");
  if (selections.length > MAX_PENDING_REQUESTS) throw new BookingRequestError(`Request up to ${MAX_PENDING_REQUESTS} times at once.`);

  const open = await prisma.bookingRequest.count({ where: { studentId, status: "PENDING", scheduledAt: { gt: new Date() } } });
  if (open + selections.length > MAX_PENDING_REQUESTS) {
    throw new BookingRequestError(`You can have ${MAX_PENDING_REQUESTS} open requests at a time. Cancel one or wait for an answer.`);
  }

  const results: RequestResult[] = [];
  const sent: { scheduledAt: Date; label: string | null }[] = [];
  for (const selection of selections) {
    const base = { scheduleId: selection.scheduleId, occurrenceDateMs: selection.occurrenceDateMs, chunkIndex: selection.chunkIndex };
    try {
      const hour = await resolveRequestedHour(selection.scheduleId, selection.occurrenceDateMs, selection.chunkIndex);

      const [already, taken, heldByPlan, credits] = await Promise.all([
        prisma.bookingRequest.findFirst({ where: { studentId, scheduleId: hour.schedule.id, scheduledAt: hour.scheduledAt, status: "PENDING" }, select: { id: true } }),
        prisma.classBooking.findFirst({ where: { scheduleId: hour.schedule.id, scheduledAt: hour.scheduledAt, status: "SCHEDULED" }, select: { id: true } }),
        prisma.paymentPlan.findFirst({
          where: { reservedScheduleId: hour.schedule.id, reservedChunkIndex: selection.chunkIndex, userId: { not: studentId }, OR: livePaymentPlanConditions() },
          select: { id: true },
        }),
        getEffectiveClassCredits(studentId),
      ]);
      if (already) throw new ClassBookingError("You already asked for that time.");
      if (taken) throw new ClassBookingError("That time was just booked by someone else.");
      if (heldByPlan) throw new ClassBookingError("That time is reserved for another student's plan.");
      if (credits < hour.credits) throw new ClassBookingError("You do not have enough credits for that class yet.");

      await prisma.bookingRequest.create({
        data: { studentId, scheduleId: hour.schedule.id, occurrenceDate: hour.occurrenceDate, scheduledAt: hour.scheduledAt, chunkIndex: selection.chunkIndex },
      });
      sent.push({ scheduledAt: hour.scheduledAt, label: hour.schedule.label });
      results.push({ ...base, ok: true });
    } catch (err) {
      if (!(err instanceof ClassBookingError)) throw err;
      results.push({ ...base, ok: false, error: err.message });
    }
  }

  if (sent.length > 0) await announceNewRequests(studentId, sent);
  return results;
}

/** The student gets a receipt; the owner (and only the owner) gets an email if that switch is on. Neither can fail the request. */
async function announceNewRequests(studentId: string, sent: { scheduledAt: Date; label: string | null }[]): Promise<void> {
  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { name: true, email: true } });
  const lines = sent.map((s) => slotLabel(s.scheduledAt, s.label));

  await createNotification({
    userId: studentId,
    type: "BOOKING_REQUEST_RECEIVED",
    title: sent.length === 1 ? "Request sent" : "Requests sent",
    body: `We got your request for ${lines.join("; ")}. You will be told as soon as it is confirmed. Requests are answered in the order they arrive.`,
  }).catch((err) => console.error("Booking request receipt failed (non-blocking):", err));

  if (!(await getBoolSetting("booking.emailOwnerOnRequest"))) return;
  try {
    await sendNotificationEmailWithCta(
      OWNER_EMAIL,
      `New booking request from ${student?.name ?? student?.email ?? "a student"}`,
      `${student?.name ?? student?.email ?? "A student"} asked for: ${lines.join("; ")}.`,
      { label: "Review requests", url: getAppUrl("/admin/schedule?view=REQUESTS") },
    );
  } catch (err) {
    console.error("Booking request owner email failed (non-blocking):", err);
  }
}

export interface MyRequest {
  id: string;
  label: string | null;
  scheduledAt: Date;
  status: "PENDING" | "CONFIRMED" | "DECLINED" | "CANCELED";
  /** For a pending request: how many earlier requests for the same hour are still waiting. */
  ahead: number;
}

/** A student's own open requests, and the answers to recent ones. */
export async function getMyBookingRequests(studentId: string): Promise<MyRequest[]> {
  const rows = await prisma.bookingRequest.findMany({
    where: {
      studentId,
      OR: [{ status: "PENDING", scheduledAt: { gt: new Date() } }, { status: { in: ["CONFIRMED", "DECLINED"] }, decidedAt: { gt: new Date(Date.now() - 7 * 86_400_000) } }],
    },
    orderBy: { scheduledAt: "asc" },
    include: { schedule: { select: { label: true } } },
  });
  const out: MyRequest[] = [];
  for (const row of rows) {
    const ahead =
      row.status === "PENDING"
        ? await prisma.bookingRequest.count({ where: { scheduleId: row.scheduleId, scheduledAt: row.scheduledAt, status: "PENDING", createdAt: { lt: row.createdAt } } })
        : 0;
    out.push({ id: row.id, label: row.schedule.label, scheduledAt: row.scheduledAt, status: row.status, ahead });
  }
  return out;
}

export interface RequestHint {
  scheduleId: string;
  scheduledAtMs: number;
  /** Open requests for this hour (never who). */
  count: number;
  mine: boolean;
}

/** Which upcoming hours already have requests waiting, so the booking screen can say "Requested" instead of leaving it a surprise. */
export async function getRequestHints(studentId: string): Promise<RequestHint[]> {
  const rows = await prisma.bookingRequest.findMany({ where: { status: "PENDING", scheduledAt: { gt: new Date() } }, select: { scheduleId: true, scheduledAt: true, studentId: true } });
  const map = new Map<string, RequestHint>();
  for (const row of rows) {
    const key = `${row.scheduleId}:${row.scheduledAt.getTime()}`;
    const hint = map.get(key) ?? { scheduleId: row.scheduleId, scheduledAtMs: row.scheduledAt.getTime(), count: 0, mine: false };
    hint.count += 1;
    hint.mine = hint.mine || row.studentId === studentId;
    map.set(key, hint);
  }
  return Array.from(map.values());
}

export async function cancelBookingRequest(requestId: string, studentId: string): Promise<void> {
  const result = await prisma.bookingRequest.updateMany({ where: { id: requestId, studentId, status: "PENDING" }, data: { status: "CANCELED", decidedAt: new Date() } });
  if (result.count === 0) throw new BookingRequestError("That request is no longer open.");
}

export interface AdminRequestGroup {
  key: string;
  scheduleId: string;
  scheduledAt: Date;
  label: string | null;
  /** Someone already holds this hour (a booking exists), so a request on it can only be declined. */
  alreadyBooked: boolean;
  requests: { id: string; studentId: string; studentName: string; email: string; createdAt: Date }[];
}

/** Every open request, grouped by hour (soonest first); inside an hour the earliest request comes first. */
export async function getAdminBookingRequests(): Promise<AdminRequestGroup[]> {
  // A request for a time that has already passed can never be answered; tidy those away.
  await prisma.bookingRequest.updateMany({ where: { status: "PENDING", scheduledAt: { lte: new Date() } }, data: { status: "CANCELED", decidedAt: new Date() } });
  const rows = await prisma.bookingRequest.findMany({
    where: { status: "PENDING" },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    include: { student: { select: { name: true, email: true } }, schedule: { select: { label: true } } },
  });
  const groups = new Map<string, AdminRequestGroup>();
  for (const row of rows) {
    const key = `${row.scheduleId}:${row.scheduledAt.getTime()}`;
    const group = groups.get(key) ?? { key, scheduleId: row.scheduleId, scheduledAt: row.scheduledAt, label: row.schedule.label, alreadyBooked: false, requests: [] };
    group.requests.push({ id: row.id, studentId: row.studentId, studentName: row.student.name ?? row.student.email, email: row.student.email, createdAt: row.createdAt });
    groups.set(key, group);
  }
  const list = Array.from(groups.values());
  await Promise.all(
    list.map(async (group) => {
      group.alreadyBooked = Boolean(await prisma.classBooking.findFirst({ where: { scheduleId: group.scheduleId, scheduledAt: group.scheduledAt, status: "SCHEDULED" }, select: { id: true } }));
    }),
  );
  return list;
}

export async function countPendingBookingRequests(): Promise<number> {
  return prisma.bookingRequest.count({ where: { status: "PENDING", scheduledAt: { gt: new Date() } } });
}

async function tellDeclined(request: { studentId: string; scheduledAt: Date; schedule: { label: string | null } }, reason: string | null): Promise<void> {
  await createNotification({
    userId: request.studentId,
    type: "BOOKING_REQUEST_DECLINED",
    title: "That time was not available",
    body: `We could not give you ${slotLabel(request.scheduledAt, request.schedule.label)}.${reason ? ` ${reason}` : ""} Pick another time and ask again.`,
    emailCategory: "classes",
  }).catch((err) => console.error("Booking request declined notice failed (non-blocking):", err));
}

/**
 * Books the requested time for the student (same checks as any booking the studio makes: a free hour, enough credits,
 * one class a day, a plan's reserved hour) and answers the others who asked for that hour. If the booking is refused
 * the request stays open and the reason goes back to the admin.
 */
export async function confirmBookingRequest(requestId: string, adminId: string): Promise<void> {
  const request = await prisma.bookingRequest.findUnique({ where: { id: requestId }, include: { schedule: true } });
  if (!request || request.status !== "PENDING") throw new BookingRequestError("That request was already answered.");
  if (request.scheduledAt.getTime() <= Date.now()) {
    await prisma.bookingRequest.update({ where: { id: request.id }, data: { status: "CANCELED", decidedAt: new Date() } });
    throw new BookingRequestError("That time has already passed.");
  }

  await adminBookClass(request.studentId, request.scheduleId, request.occurrenceDate.getTime(), request.chunkIndex);

  const decided = await prisma.bookingRequest.updateMany({ where: { id: request.id, status: "PENDING" }, data: { status: "CONFIRMED", decidedAt: new Date(), decidedById: adminId } });
  if (decided.count === 0) return;

  const others = await prisma.bookingRequest.findMany({
    where: { scheduleId: request.scheduleId, scheduledAt: request.scheduledAt, status: "PENDING", id: { not: request.id } },
    include: { schedule: { select: { label: true } } },
  });
  for (const other of others) {
    await prisma.bookingRequest.update({ where: { id: other.id }, data: { status: "DECLINED", decidedAt: new Date(), decidedById: adminId, declineReason: "Given to someone who asked first." } });
    await tellDeclined(other, "Another student asked for it first.");
  }
}

export async function declineBookingRequest(requestId: string, adminId: string, reason?: string): Promise<void> {
  const note = (reason ?? "").trim().slice(0, 200) || null;
  const request = await prisma.bookingRequest.findUnique({ where: { id: requestId }, include: { schedule: { select: { label: true } } } });
  if (!request || request.status !== "PENDING") throw new BookingRequestError("That request was already answered.");
  const decided = await prisma.bookingRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status: "DECLINED", decidedAt: new Date(), decidedById: adminId, declineReason: note },
  });
  if (decided.count === 0) return;
  await tellDeclined(request, note);
}
