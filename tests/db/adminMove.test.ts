import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { ClassBookingError, computeScheduledAt, chunksForSchedule, rescheduleClassBooking } from "@/lib/classSchedule";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("am");
type Sched = { id: string; startTime: string; durationMin: number };
let stu: { id: string }, other: { id: string }, from: Sched, to: Sched;
const day = 86_400_000;
const dateAt = (daysAhead: number) => {
  const t = new Date(Date.now() + daysAhead * day);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
};

beforeAll(async () => {
  stu = await makeUser(tag, "Mover", { classCredits: 20 });
  other = await makeUser(tag, "Other", { classCredits: 20 });
  from = await prisma.classSchedule.create({ data: { dayOfWeek: 1, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} from` } });
  to = await prisma.classSchedule.create({ data: { dayOfWeek: 3, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} to` } });
});
afterAll(async () => {
  await prisma.classBooking.deleteMany({ where: { studentId: { in: [stu.id, other.id] } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [stu.id, other.id] } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: [stu.id, other.id] } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: [from.id, to.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [stu.id, other.id] } } });
});

async function bookingInside(hours: number, planId?: string) {
  // A class starting `hours` from now: inside the cancellation cutoff for a small number.
  const at = new Date(Date.now() + hours * 3_600_000);
  return prisma.classBooking.create({
    data: {
      studentId: stu.id,
      scheduleId: from.id,
      occurrenceDate: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())),
      scheduledAt: at,
      creditsSpent: 2,
      reservedByPlanId: planId,
    },
  });
}
const target = (daysAhead: number) => {
  const date = dateAt(daysAhead);
  return { date, ms: date.getTime(), at: computeScheduledAt(to, date, chunksForSchedule(to)[0]) };
};

describe("an admin moves a class in one step", () => {
  it("moves a class that is inside the cutoff, which the student cannot move themselves", async () => {
    const b = await bookingInside(2);
    const t = target(5);
    await expect(rescheduleClassBooking(stu.id, b.id, to.id, t.ms, 0)).rejects.toThrow(/Too close to class time/);
    const moved = await rescheduleClassBooking(stu.id, b.id, to.id, t.ms, 0, undefined, { byAdmin: true });
    expect(moved.scheduledAt.getTime()).toBe(t.at.getTime());
    expect((await prisma.classBooking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("CANCELED");
    expect(await prisma.classBooking.count({ where: { studentId: stu.id, status: "SCHEDULED", scheduleId: to.id } })).toBe(1);
    expect(await prisma.notification.findFirst({ where: { userId: stu.id, title: "Your class was moved" } })).toBeTruthy();
  });

  it("keeps a subscriber's plan link and marks the old week skipped so the weekly job leaves it alone", async () => {
    const plan = await prisma.paymentPlan.create({
      data: { userId: stu.id, cadence: "MIN_60_WEEKLY", term: "MONTHLY", installmentAmountCents: 24000, creditsPerInstallment: 8, termMonths: 1, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 20 * day), status: "ACTIVE" },
    });
    const b = await bookingInside(48, plan.id);
    const t = target(9);
    const moved = await rescheduleClassBooking(stu.id, b.id, to.id, t.ms, 0, undefined, { byAdmin: true });
    expect(moved.reservedByPlanId).toBe(plan.id);
    expect((await prisma.classBooking.findUniqueOrThrow({ where: { id: b.id } })).canceledReason).toBeTruthy();
  });

  it("changes nothing when the new time is already taken by someone else", async () => {
    const b = await bookingInside(72);
    const t = target(12);
    await prisma.classBooking.create({ data: { studentId: other.id, scheduleId: to.id, occurrenceDate: t.date, scheduledAt: t.at, creditsSpent: 2 } });
    await expect(rescheduleClassBooking(stu.id, b.id, to.id, t.ms, 0, undefined, { byAdmin: true })).rejects.toBeInstanceOf(ClassBookingError);
    expect((await prisma.classBooking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("SCHEDULED");
  });

  it("refuses a class that has already started", async () => {
    const past = await prisma.classBooking.create({
      data: { studentId: stu.id, scheduleId: from.id, occurrenceDate: dateAt(-3), scheduledAt: new Date(Date.now() - 3 * day), creditsSpent: 2 },
    });
    await expect(rescheduleClassBooking(stu.id, past.id, to.id, target(15).ms, 0, undefined, { byAdmin: true })).rejects.toThrow(/already started/);
  });
});
