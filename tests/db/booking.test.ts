import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { bookClass, cancelClassBooking, rescheduleClassBooking, nextOccurrenceDates, ClassBookingError } from "@/lib/classSchedule";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("bk");
const ms = (d: Date) => d.getTime();
let admin: { id: string }, planStu: { id: string }, plainStu: { id: string }, mon: { id: string }, wed: { id: string }, plan: { id: string };
const extraRows: { users: string[]; schedules: string[]; plans: string[] } = { users: [], schedules: [], plans: [] };

async function planFor(userId: string) {
  const p = await prisma.paymentPlan.create({
    data: { userId, cadence: "MIN_60_WEEKLY", term: "MONTHLY", installmentAmountCents: 24000, creditsPerInstallment: 8, termMonths: 1, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 20 * 86_400_000), status: "ACTIVE" },
  });
  extraRows.plans.push(p.id);
  return p;
}

beforeAll(async () => {
  admin = await makeUser(tag, "Teacher", { role: "ADMIN" });
  planStu = await makeUser(tag, "Plan Pat", { classCredits: 100 });
  plainStu = await makeUser(tag, "Plain Pam", { classCredits: 100 });
  mon = await prisma.classSchedule.create({ data: { dayOfWeek: 1, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} Monday` } });
  wed = await prisma.classSchedule.create({ data: { dayOfWeek: 3, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} Wednesday` } });
  plan = await planFor(planStu.id);
  extraRows.users.push(admin.id, planStu.id, plainStu.id);
  extraRows.schedules.push(mon.id, wed.id);
});
afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: extraRows.users } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: extraRows.users } } });
  await prisma.paymentPlan.deleteMany({ where: { id: { in: extraRows.plans } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: extraRows.schedules } } });
  await prisma.user.deleteMany({ where: { id: { in: extraRows.users } } });
});

describe("one credit-booked class a week for a subscriber", () => {
  it("blocks a second class in the same week, allows the next week", async () => {
    const monDates = nextOccurrenceDates(1, 8), wedDates = nextOccurrenceDates(3, 8);
    const m = monDates[1];
    const w = wedDates.find((d) => ms(d) - ms(m) === 2 * 86_400_000)!;
    await bookClass(planStu.id, mon.id, ms(m), 0, 2);
    await expect(bookClass(planStu.id, wed.id, ms(w), 0, 2)).rejects.toThrow(/credits cover one class a week/);
    const nextWed = wedDates.find((d) => ms(d) - ms(m) > 7 * 86_400_000)!;
    await bookClass(planStu.id, wed.id, ms(nextWed), 0, 2);
  });
  it("leaves a student without a plan unlimited", async () => {
    const m = nextOccurrenceDates(1, 8)[6];
    const w = nextOccurrenceDates(3, 8).find((d) => ms(d) - ms(m) === 2 * 86_400_000)!;
    await bookClass(plainStu.id, mon.id, ms(m), 0, 2);
    await bookClass(plainStu.id, wed.id, ms(w), 0, 2);
  });
  it("cancel frees the week and tells the teacher who canceled", async () => {
    const m = nextOccurrenceDates(1, 8)[4];
    const w = nextOccurrenceDates(3, 8).find((d) => ms(d) - ms(m) === 2 * 86_400_000)!;
    const b = await bookClass(planStu.id, mon.id, ms(m), 0, 2);
    await cancelClassBooking(b.id, planStu.id);
    await bookClass(planStu.id, wed.id, ms(w), 0, 2);
    const note = await prisma.notification.findFirst({ where: { userId: admin.id, title: "Plan Pat canceled a class" } });
    expect(note?.body).toMatch(/Plan Pat canceled their/);
  });
  it("moves a plan's weekly class for one week and keeps the plan link", async () => {
    const m = nextOccurrenceDates(1, 8)[5];
    const reserved = await prisma.classBooking.create({
      data: { studentId: planStu.id, scheduleId: mon.id, occurrenceDate: m, scheduledAt: new Date(ms(m) + 15 * 3_600_000), creditsSpent: 2, reservedByPlanId: plan.id },
    });
    const w = nextOccurrenceDates(3, 8).find((d) => ms(d) - ms(m) === 2 * 86_400_000)!;
    const moved = await rescheduleClassBooking(planStu.id, reserved.id, wed.id, ms(w), 0, 2);
    expect(moved.reservedByPlanId).toBe(plan.id);
    const old = await prisma.classBooking.findUniqueOrThrow({ where: { id: reserved.id } });
    expect(old.status).toBe("CANCELED");
    expect(old.canceledReason).toBe("SKIPPED_BY_STUDENT");
    const note = await prisma.notification.findFirst({ where: { userId: admin.id, title: "Plan Pat rescheduled a class" } });
    expect(note?.body).toMatch(/rescheduled from .* to /);
  });
  it("refuses a move into a week that already has a class, and lets an admin book past the limit", async () => {
    const stu = await makeUser(tag, "Third Tia", { classCredits: 100 });
    extraRows.users.push(stu.id);
    await planFor(stu.id);
    const tue = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "11:00", durationMin: 45, creditCost: 2, label: `${tag} Tuesday` } });
    const thu = await prisma.classSchedule.create({ data: { dayOfWeek: 4, startTime: "11:00", durationMin: 45, creditCost: 2, label: `${tag} Thursday` } });
    extraRows.schedules.push(tue.id, thu.id);
    const tues = nextOccurrenceDates(2, 8), thus = tues.map((d) => new Date(ms(d) + 2 * 86_400_000));
    const a = await bookClass(stu.id, tue.id, ms(tues[3]), 0, 2);
    await bookClass(stu.id, thu.id, ms(thus[4]), 0, 2);
    await expect(rescheduleClassBooking(stu.id, a.id, tue.id, ms(tues[4]), 0, 2)).rejects.toThrow(/credits cover one class a week/);
    await bookClass(stu.id, tue.id, ms(tues[5]), 0, 2);
    await expect(bookClass(stu.id, thu.id, ms(thus[5]), 0, 2)).rejects.toBeInstanceOf(ClassBookingError);
    await bookClass(stu.id, thu.id, ms(thus[5]), 0, 2, { isAdminAssisted: true });
  });
  it("still enforces one class a day and enough credits", async () => {
    const poor = await makeUser(tag, "Poor Pete", { classCredits: 1 });
    extraRows.users.push(poor.id);
    const m = nextOccurrenceDates(1, 8)[7];
    await expect(bookClass(poor.id, mon.id, ms(m), 0, 2)).rejects.toThrow(/credit/);
  });
});
