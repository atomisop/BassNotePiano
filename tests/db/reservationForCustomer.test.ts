import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, getServerSession: async () => null, authOptions: {} }));
import { adminBookClass, bookClass, chunksForSchedule, computeScheduledAt, createReservedBookingIfAbsent, getUpcomingOccurrences, nextOccurrenceDates } from "@/lib/classSchedule";
import { OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { createOwnerReservation, listOwnerReservations, releaseOwnerReservation } from "@/lib/ownerReservationsAdmin";
import { makeUser, newTag, prisma } from "./helpers";

// A time the owner keeps for a customer opens only for the account with that VERIFIED email; everyone else stays locked out.
const tag = newTag("rc");
const iso = (d: Date) => d.toISOString().slice(0, 10);
let admin: { id: string };
let customer: { id: string; email: string };
let mixedCase: { id: string; email: string };
let unverified: { id: string; email: string };
let stranger: { id: string };
let sched: { id: string };
// Skip the nearest Tuesday: it can be inside the booking cutoff.
const dates = nextOccurrenceDates(2, 8).slice(1);
const contact = (email: string) => ({ name: "Pat Customer", email, phone: "(212) 555-0134" });
const everyone = () => [customer.id, mixedCase.id, unverified.id, stranger.id];

beforeAll(async () => {
  admin = await makeUser(tag, "Admin", { role: "ADMIN" });
  customer = await makeUser(tag, "Customer", { classCredits: 40, emailVerified: new Date() });
  mixedCase = await makeUser(tag, "Mixed", { classCredits: 40, emailVerified: new Date(), email: `${tag}-Mixed@Example.com` });
  unverified = await makeUser(tag, "Unverified", { classCredits: 40, emailVerified: null });
  stranger = await makeUser(tag, "Stranger", { classCredits: 40, emailVerified: new Date() });
  sched = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "09:00", durationMin: 120, creditCost: 4, label: `${tag} a` } });
});
afterAll(async () => {
  await prisma.ownerReservation.deleteMany({ where: { scheduleId: sched.id } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: everyone() } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: everyone() } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [...everyone(), admin.id] } } });
  await prisma.auditLog.deleteMany({ where: { actorId: admin.id } });
  await prisma.classSchedule.deleteMany({ where: { id: sched.id } });
  await prisma.user.deleteMany({ where: { id: { in: [...everyone(), admin.id] } } });
});

describe("a time reserved for a customer", () => {
  it("opens for the matching verified customer and stays locked for everyone else", async () => {
    const made = await createOwnerReservation(admin.id, { ...contact(customer.email), date: iso(dates[0]), hours: [{ scheduleId: sched.id, chunkIndex: 0 }] });
    await expect(bookClass(stranger.id, sched.id, dates[0].getTime(), 0)).rejects.toThrow(/reserved by the owner/);
    await expect(adminBookClass(stranger.id, sched.id, dates[0].getTime(), 0, 2)).rejects.toThrow(/reserved by the owner/);
    const booking = await bookClass(customer.id, sched.id, dates[0].getTime(), 0);
    expect(booking.studentId).toBe(customer.id);
    await prisma.classBooking.deleteMany({ where: { studentId: customer.id } });
    await releaseOwnerReservation(made.groupId);
  });

  it("the owner booking on the customer's behalf works too, and still refuses a stranger", async () => {
    const made = await createOwnerReservation(admin.id, { ...contact(customer.email), date: iso(dates[1]), hours: [{ scheduleId: sched.id, chunkIndex: 1 }] });
    await expect(adminBookClass(stranger.id, sched.id, dates[1].getTime(), 1, 2)).rejects.toThrow(/reserved by the owner/);
    await adminBookClass(customer.id, sched.id, dates[1].getTime(), 1, 2);
    await prisma.classBooking.deleteMany({ where: { studentId: customer.id } });
    await releaseOwnerReservation(made.groupId);
  });

  it("matches the email ignoring capitals", async () => {
    const made = await createOwnerReservation(admin.id, { ...contact(mixedCase.email), date: iso(dates[2]), hours: [{ scheduleId: sched.id, chunkIndex: 0 }] });
    await bookClass(mixedCase.id, sched.id, dates[2].getTime(), 0);
    await prisma.classBooking.deleteMany({ where: { studentId: mixedCase.id } });
    await releaseOwnerReservation(made.groupId);
  });

  it("does not open for an account whose email is not verified", async () => {
    const made = await createOwnerReservation(admin.id, { ...contact(unverified.email), date: iso(dates[3]), hours: [{ scheduleId: sched.id, chunkIndex: 0 }] });
    await expect(bookClass(unverified.id, sched.id, dates[3].getTime(), 0)).rejects.toThrow(/reserved by the owner/);
    await releaseOwnerReservation(made.groupId);
  });

  it("a whole day opens every hour for the customer and none for anyone else", async () => {
    const made = await createOwnerReservation(admin.id, { ...contact(customer.email), date: iso(dates[4]), hours: null });
    for (const i of [0, 1]) await expect(bookClass(stranger.id, sched.id, dates[4].getTime(), i)).rejects.toThrow(/reserved by the owner/);
    // One student books one hour per window per day (the usual rule), but any hour of the reserved day is theirs to pick.
    await bookClass(customer.id, sched.id, dates[4].getTime(), 1);
    await prisma.classBooking.deleteMany({ where: { studentId: customer.id } });
    await releaseOwnerReservation(made.groupId);
  });

  it("the customer's own list shows it open and 'for you'; anyone else, and a list with no viewer, shows it taken", async () => {
    const made = await createOwnerReservation(admin.id, { ...contact(customer.email), date: iso(dates[5]), hours: [{ scheduleId: sched.id, chunkIndex: 0 }] });
    const find = (list: Awaited<ReturnType<typeof getUpcomingOccurrences>>) =>
      list.find((o) => o.scheduleId === sched.id && o.occurrenceDate.getTime() === dates[5].getTime() && o.chunkIndex === 0);
    expect(find(await getUpcomingOccurrences(customer.id))).toMatchObject({ isBooked: false, reservedForYou: true, reservedByOwner: false });
    expect(find(await getUpcomingOccurrences(stranger.id))).toMatchObject({ isBooked: true, reservedByOwner: true, reservedForYou: false });
    expect(find(await getUpcomingOccurrences())).toMatchObject({ isBooked: true, reservedByOwner: true, reservedForYou: false });
    await releaseOwnerReservation(made.groupId);
  });

  it("the owner's list says whether the customer can claim it yet, and when they have booked", async () => {
    const mine = await createOwnerReservation(admin.id, { ...contact(customer.email), date: iso(dates[0]), hours: [{ scheduleId: sched.id, chunkIndex: 0 }] });
    const unv = await createOwnerReservation(admin.id, { ...contact(unverified.email), date: iso(dates[1]), hours: [{ scheduleId: sched.id, chunkIndex: 0 }] });
    const none = await createOwnerReservation(admin.id, { ...contact(`${tag}-nobody@example.com`), date: iso(dates[2]), hours: [{ scheduleId: sched.id, chunkIndex: 0 }] });
    const find = async (id: string) => (await listOwnerReservations()).find((g) => g.groupId === id);
    expect(await find(mine.groupId)).toMatchObject({ account: "verified", booked: false });
    expect(await find(unv.groupId)).toMatchObject({ account: "unverified", booked: false });
    expect(await find(none.groupId)).toMatchObject({ account: "none", booked: false });
    await bookClass(customer.id, sched.id, dates[0].getTime(), 0);
    expect(await find(mine.groupId)).toMatchObject({ account: "verified", booked: true });
    await prisma.classBooking.deleteMany({ where: { studentId: customer.id } });
    for (const g of [mine, unv, none]) await releaseOwnerReservation(g.groupId);
  });

  it("a weekly plan books onto the customer's own reserved day, but a stranger's plan on that slot is still skipped", async () => {
    const schedule = await prisma.classSchedule.findUniqueOrThrow({ where: { id: sched.id } });
    const chunk = chunksForSchedule(schedule)[0];
    const date = dates[3];
    const scheduledAt = computeScheduledAt(schedule, date, chunk);
    const made = await createOwnerReservation(admin.id, { ...contact(customer.email), date: iso(date), hours: [{ scheduleId: sched.id, chunkIndex: 0 }] });
    const planFor = (userId: string) =>
      prisma.paymentPlan.create({
        data: { userId, cadence: OFFERED_PLAN_CADENCE, term: "TERM_3", installmentAmountCents: 5500, creditsPerInstallment: 8, termMonths: 3, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 25 * 86_400_000), reservedScheduleId: sched.id, reservedChunkIndex: 0 },
      });
    const params = (studentId: string, planId: string) => ({ studentId, scheduleId: sched.id, occurrenceDate: date, scheduledAt, creditsSpent: 2, planId });

    const strangerPlan = await planFor(stranger.id);
    expect(await createReservedBookingIfAbsent(params(stranger.id, strangerPlan.id))).toBeNull();
    await prisma.paymentPlan.delete({ where: { id: strangerPlan.id } });

    const customerPlan = await planFor(customer.id);
    expect(await createReservedBookingIfAbsent(params(customer.id, customerPlan.id))).toMatchObject({ studentId: customer.id });
    await prisma.classBooking.deleteMany({ where: { studentId: customer.id } });
    await prisma.paymentPlan.delete({ where: { id: customerPlan.id } });
    await releaseOwnerReservation(made.groupId);
  });
});
