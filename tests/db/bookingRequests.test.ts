import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, sendNotificationEmailWithCta: vi.fn(async () => undefined), sendNotificationEmail: vi.fn(async () => undefined) };
});
import { sendNotificationEmailWithCta } from "@/lib/email";
import { OWNER_EMAIL } from "@/lib/adminNotifications";
import { adminBookClass, bookClass, nextOccurrenceDates, ClassBookingError } from "@/lib/classSchedule";
import { resetSetting, saveSetting } from "@/lib/siteSettings";
import {
  BookingRequestError,
  cancelBookingRequest,
  confirmBookingRequest,
  createBookingRequests,
  declineBookingRequest,
  getAdminBookingRequests,
  getMyBookingRequests,
  getRequestHints,
  MAX_PENDING_REQUESTS,
} from "@/lib/bookingRequests";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("br");
const mailed = vi.mocked(sendNotificationEmailWithCta);
const userIds: string[] = [];
let admin: { id: string }, ann: { id: string }, ben: { id: string }, broke: { id: string };
let schedule: { id: string };
const schedules: { id: string }[] = [];
let slotCounter = 0;

/** A fresh future hour each call (several weekly times across several weeks), so tests never collide on the same hour. */
function nextSlot() {
  const dates = nextOccurrenceDates(2, 8);
  const i = slotCounter++;
  return { scheduleId: schedules[i % schedules.length].id, occurrenceDateMs: dates[1 + (Math.floor(i / schedules.length) % (dates.length - 1))].getTime(), chunkIndex: 0 };
}

beforeAll(async () => {
  admin = await makeUser(tag, "Teacher", { role: "ADMIN" });
  ann = await makeUser(tag, "Ann Early", { classCredits: 100 });
  ben = await makeUser(tag, "Ben Later", { classCredits: 100 });
  broke = await makeUser(tag, "Broke Student", { classCredits: 0 });
  userIds.push(admin.id, ann.id, ben.id, broke.id);
  for (const hour of ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"]) {
    schedules.push(await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: hour, durationMin: 45, creditCost: 2, label: `${tag} ${hour}` } }));
  }
  schedule = schedules[0];
});

beforeEach(async () => {
  mailed.mockClear();
  await saveSetting("booking.requestMode", true);
  await resetSetting("booking.emailOwnerOnRequest");
});

afterAll(async () => {
  await resetSetting("booking.requestMode");
  await resetSetting("booking.emailOwnerOnRequest");
  const ids = schedules.map((x) => x.id);
  await prisma.bookingRequest.deleteMany({ where: { scheduleId: { in: ids } } });
  await prisma.classBooking.deleteMany({ where: { scheduleId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

const where = (slot: { scheduleId: string; occurrenceDateMs: number }) => ({ scheduleId: slot.scheduleId, occurrenceDate: new Date(slot.occurrenceDateMs) });

describe("request mode", () => {
  it("stops students booking by themselves but still lets the studio book", async () => {
    const slot = nextSlot();
    await expect(bookClass(ann.id, slot.scheduleId, slot.occurrenceDateMs, 0, 2)).rejects.toThrow(/by request/);
    const booking = await adminBookClass(ann.id, slot.scheduleId, slot.occurrenceDateMs, 0);
    expect(booking.studentId).toBe(ann.id);
  });

  it("lets students book normally once the mode is off, and refuses requests", async () => {
    await saveSetting("booking.requestMode", false);
    const fresh = await makeUser(tag, "Fresh Student", { classCredits: 100 });
    userIds.push(fresh.id);
    await expect(createBookingRequests(fresh.id, [nextSlot()])).rejects.toBeInstanceOf(BookingRequestError);
    const slot = nextSlot();
    await expect(bookClass(fresh.id, slot.scheduleId, slot.occurrenceDateMs, 0, 2)).resolves.toBeTruthy();
  });
});

describe("sending a request", () => {
  it("queues it without booking or charging, tells the student, and emails only the owner", async () => {
    const slot = nextSlot();
    const [result] = await createBookingRequests(ann.id, [slot]);
    expect(result.ok).toBe(true);
    expect(await prisma.classBooking.count({ where: where(slot) })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ann.id } })).classCredits).toBe(100);
    expect(await prisma.notification.count({ where: { userId: ann.id, type: "BOOKING_REQUEST_RECEIVED" } })).toBeGreaterThan(0);
    // Only the request emails count here (a booking made earlier may still be sending its own notices).
    const requestMail = mailed.mock.calls.filter((call) => /booking request/i.test(String(call[1])));
    expect(requestMail.map((call) => call[0])).toEqual([OWNER_EMAIL]);
    expect(requestMail[0][1]).toMatch(/Ann Early/);
  });

  it("does not email the owner when that switch is off", async () => {
    await saveSetting("booking.emailOwnerOnRequest", false);
    await createBookingRequests(ann.id, [nextSlot()]);
    expect(mailed.mock.calls.filter((call) => call[0] === OWNER_EMAIL)).toHaveLength(0);
  });

  it("refuses a repeat request, a student with no credits, a past or invalid hour, and too many at once", async () => {
    const slot = nextSlot();
    await createBookingRequests(ann.id, [slot]);
    expect((await createBookingRequests(ann.id, [slot]))[0]).toMatchObject({ ok: false, error: expect.stringMatching(/already asked/) });
    expect((await createBookingRequests(broke.id, [nextSlot()]))[0]).toMatchObject({ ok: false, error: expect.stringMatching(/enough credits/) });
    expect((await createBookingRequests(ben.id, [{ ...nextSlot(), chunkIndex: 9 }]))[0].ok).toBe(false);
    expect((await createBookingRequests(ben.id, [{ ...nextSlot(), occurrenceDateMs: Date.UTC(2020, 0, 7) }]))[0].ok).toBe(false);
    await expect(createBookingRequests(ben.id, Array.from({ length: MAX_PENDING_REQUESTS + 1 }, () => nextSlot()))).rejects.toBeInstanceOf(BookingRequestError);
  });

  it("refuses an hour a payment plan holds, and an hour already booked", async () => {
    const held = nextSlot();
    const plan = await prisma.paymentPlan.create({
      data: { userId: broke.id, cadence: "MIN_60_WEEKLY", term: "MONTHLY", installmentAmountCents: 16500, creditsPerInstallment: 4, termMonths: 1, nextDueDate: new Date(), reservedScheduleId: held.scheduleId, reservedChunkIndex: 0 },
    });
    try {
      expect((await createBookingRequests(ann.id, [held]))[0]).toMatchObject({ ok: false, error: expect.stringMatching(/reserved/) });
    } finally {
      await prisma.paymentPlan.delete({ where: { id: plan.id } });
    }
    const booked = nextSlot();
    await adminBookClass(ben.id, booked.scheduleId, booked.occurrenceDateMs, 0);
    expect((await createBookingRequests(ann.id, [booked]))[0]).toMatchObject({ ok: false, error: expect.stringMatching(/just booked/) });
  });
});

describe("the queue", () => {
  it("serves the earliest request first and shows only a count to others", async () => {
    const slot = nextSlot();
    await createBookingRequests(ann.id, [slot]);
    await createBookingRequests(ben.id, [slot]);
    const group = (await getAdminBookingRequests()).find((g) => g.scheduleId === slot.scheduleId && g.scheduledAt.getTime() > Date.now() && g.requests.length === 2 && g.requests.some((r) => r.studentId === ann.id))!;
    expect(group.requests.map((r) => r.studentName)).toEqual(["Ann Early", "Ben Later"]);
    expect((await getMyBookingRequests(ben.id)).some((r) => r.ahead === 1)).toBe(true);
    const hints = await getRequestHints(ben.id);
    expect(hints.find((h) => h.count === 2)).toMatchObject({ mine: true });
    expect(JSON.stringify(hints)).not.toMatch(/Ann/);
  });

  it("confirming books the student and tells the others they were not first", async () => {
    const slot = nextSlot();
    await createBookingRequests(ann.id, [slot]);
    await createBookingRequests(ben.id, [slot]);
    const annRequest = await prisma.bookingRequest.findFirstOrThrow({ where: { studentId: ann.id, ...where(slot) } });
    await confirmBookingRequest(annRequest.id, admin.id);
    expect((await prisma.bookingRequest.findUniqueOrThrow({ where: { id: annRequest.id } })).status).toBe("CONFIRMED");
    expect(await prisma.classBooking.count({ where: { studentId: ann.id, ...where(slot), status: "SCHEDULED" } })).toBe(1);
    const benRequest = await prisma.bookingRequest.findFirstOrThrow({ where: { studentId: ben.id, ...where(slot) } });
    expect(benRequest.status).toBe("DECLINED");
    expect(await prisma.notification.count({ where: { userId: ben.id, type: "BOOKING_REQUEST_DECLINED" } })).toBeGreaterThan(0);
    await expect(confirmBookingRequest(annRequest.id, admin.id)).rejects.toBeInstanceOf(BookingRequestError);
  });

  it("a confirm that the booking rules refuse leaves the request open", async () => {
    const slot = nextSlot();
    await createBookingRequests(ann.id, [slot]);
    const request = await prisma.bookingRequest.findFirstOrThrow({ where: { studentId: ann.id, ...where(slot) } });
    await prisma.user.update({ where: { id: ann.id }, data: { classCredits: 0 } });
    try {
      await expect(confirmBookingRequest(request.id, admin.id)).rejects.toBeInstanceOf(ClassBookingError);
      expect((await prisma.bookingRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("PENDING");
    } finally {
      await prisma.user.update({ where: { id: ann.id }, data: { classCredits: 100 } });
    }
  });

  it("declining tells the student with the reason, and canceling is for the student's own open requests only", async () => {
    const slot = nextSlot();
    await createBookingRequests(ben.id, [slot]);
    const request = await prisma.bookingRequest.findFirstOrThrow({ where: { studentId: ben.id, ...where(slot) } });
    await expect(cancelBookingRequest(request.id, ann.id)).rejects.toBeInstanceOf(BookingRequestError);
    await declineBookingRequest(request.id, admin.id, "That hour is for a family.");
    const note = await prisma.notification.findFirst({ where: { userId: ben.id, type: "BOOKING_REQUEST_DECLINED" }, orderBy: { createdAt: "desc" } });
    expect(note?.body).toMatch(/for a family/);
    const second = nextSlot();
    await createBookingRequests(ben.id, [second]);
    const mine = await prisma.bookingRequest.findFirstOrThrow({ where: { studentId: ben.id, ...where(second), status: "PENDING" } });
    await cancelBookingRequest(mine.id, ben.id);
    expect((await prisma.bookingRequest.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("CANCELED");
  });
});
