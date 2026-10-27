import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, getServerSession: async () => null, authOptions: {} }));
import { adminBookClass, bookClass, chunksForSchedule, ClassBookingError, getUpcomingOccurrences, nextOccurrenceDates } from "@/lib/classSchedule";
import { createOwnerReservation, listOwnerReservations, releaseOwnerReservation } from "@/lib/ownerReservationsAdmin";
import { changeReservedSlot } from "@/lib/paymentPlans";
import { OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("or");
const DAY = 86_400_000;
let stu: { id: string }, planStu: { id: string }, admin: { id: string };
let sched: { id: string; dayOfWeek: number }, dest: { id: string; dayOfWeek: number };
let date: Date;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const contact = { name: "Pat Customer", email: "pat@example.com", phone: "(212) 555-0134" };

beforeAll(async () => {
  stu = await makeUser(tag, "Student", { classCredits: 40 });
  planStu = await makeUser(tag, "Planner", { classCredits: 40 });
  admin = await makeUser(tag, "Admin", { role: "ADMIN" });
  sched = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "09:00", durationMin: 120, creditCost: 4, label: `${tag} a` } });
  dest = await prisma.classSchedule.create({ data: { dayOfWeek: 4, startTime: "09:00", durationMin: 60, creditCost: 2, label: `${tag} b` } });
  date = nextOccurrenceDates(2, 3)[1];
});
afterAll(async () => {
  await prisma.ownerReservation.deleteMany({ where: { scheduleId: { in: [sched.id, dest.id] } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: [stu.id, planStu.id] } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [stu.id, planStu.id] } } });
  await prisma.auditLog.deleteMany({ where: { actorId: admin.id } });
  await prisma.creditGrant.deleteMany({ where: { userId: planStu.id } });
  await prisma.paymentPlan.deleteMany({ where: { userId: planStu.id } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: [sched.id, dest.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [stu.id, planStu.id, admin.id] } } });
});

describe("a day the owner keeps for a customer", () => {
  it("one hour: that hour is refused to everyone, the other hour still books", async () => {
    const made = await createOwnerReservation(admin.id, { ...contact, date: iso(date), hours: [{ scheduleId: sched.id, chunkIndex: 0 }] });
    await expect(bookClass(stu.id, sched.id, date.getTime(), 0)).rejects.toThrow(/reserved by the owner/);
    await expect(adminBookClass(stu.id, sched.id, date.getTime(), 0, 2)).rejects.toThrow(/reserved by the owner/);
    const open = await getUpcomingOccurrences();
    const mine = open.filter((o) => o.scheduleId === sched.id && o.occurrenceDate.getTime() === date.getTime());
    expect(mine.find((o) => o.chunkIndex === 0)).toMatchObject({ isBooked: true, reservedByOwner: true });
    expect(mine.find((o) => o.chunkIndex === 1)).toMatchObject({ isBooked: false });
    await bookClass(stu.id, sched.id, date.getTime(), 1);
    expect(await releaseOwnerReservation(made.groupId)).toBe(1);
    await prisma.classBooking.deleteMany({ where: { studentId: stu.id } });
  });

  it("the whole day: every hour is refused until it is released, then it books again", async () => {
    const made = await createOwnerReservation(admin.id, { ...contact, date: iso(date), hours: null });
    for (const i of [0, 1]) await expect(bookClass(stu.id, sched.id, date.getTime(), i)).rejects.toBeInstanceOf(ClassBookingError);
    const list = await listOwnerReservations();
    expect(list.find((g) => g.groupId === made.groupId)).toMatchObject({ what: "Whole day", name: "Pat Customer", email: "pat@example.com" });
    await releaseOwnerReservation(made.groupId);
    await bookClass(stu.id, sched.id, date.getTime(), 0);
    expect(await listOwnerReservations()).toHaveLength(0);
  });

  it("refuses without a real name, email and phone, and over a class someone already booked", async () => {
    await expect(createOwnerReservation(admin.id, { ...contact, email: "nope", date: iso(date), hours: null })).rejects.toThrow(/email/i);
    await expect(createOwnerReservation(admin.id, { ...contact, phone: "", date: iso(date), hours: null })).rejects.toThrow(/phone/i);
    await expect(createOwnerReservation(admin.id, { ...contact, date: iso(date), hours: null })).rejects.toThrow(/already has a class/);
    expect(await prisma.ownerReservation.count({ where: { scheduleId: sched.id, releasedAt: null } })).toBe(0);
  });
});

describe("the studio moving a whole plan", () => {
  it("moves the weekly time and every upcoming class, and tells the student; a reserved day is skipped", async () => {
    const due = new Date(Date.now() + 25 * DAY);
    const plan = await prisma.paymentPlan.create({
      data: { userId: planStu.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_3", installmentAmountCents: 5500, creditsPerInstallment: 8, termMonths: 3, installmentsPaid: 1, nextDueDate: due, reservedScheduleId: sched.id, reservedChunkIndex: 0 },
    });
    const old = nextOccurrenceDates(2, 3)[0];
    await prisma.classBooking.create({
      data: { studentId: planStu.id, scheduleId: sched.id, occurrenceDate: old, scheduledAt: new Date(Date.now() + 4 * DAY), creditsSpent: 2, reservedByPlanId: plan.id },
    });
    const destDates = nextOccurrenceDates(4, 4);
    await createOwnerReservation(admin.id, { ...contact, date: iso(destDates[0]), hours: null });

    await changeReservedSlot(planStu.id, dest.id, 0, { byAdmin: true });

    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after).toMatchObject({ reservedScheduleId: dest.id, reservedChunkIndex: 0 });
    expect(await prisma.classBooking.count({ where: { studentId: planStu.id, scheduleId: sched.id, status: "SCHEDULED" } })).toBe(0);
    const moved = await prisma.classBooking.findMany({ where: { studentId: planStu.id, scheduleId: dest.id, status: "SCHEDULED" } });
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.some((b) => b.occurrenceDate.getTime() === destDates[0].getTime())).toBe(false);
    expect(await prisma.notification.findFirst({ where: { userId: planStu.id, title: "Your weekly class time changed" } })).toBeTruthy();
    void chunksForSchedule;
  });
});
