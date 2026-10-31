import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { PlanHoldError, computeScheduledAt, chunksForSchedule, getUpcomingOccurrences, rescheduleClassBooking } from "@/lib/classSchedule";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ph");
type Sched = { id: string; startTime: string; durationMin: number };
let stu: { id: string }, holder: { id: string }, from: Sched, to: Sched;
const day = 86_400_000;
const dateAt = (daysAhead: number) => {
  const t = new Date(Date.now() + daysAhead * day);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
};

beforeAll(async () => {
  stu = await makeUser(tag, "Mover", { classCredits: 20 });
  holder = await makeUser(tag, "Holder", { classCredits: 20 });
  from = await prisma.classSchedule.create({ data: { dayOfWeek: 1, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} from` } });
  to = await prisma.classSchedule.create({ data: { dayOfWeek: 3, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} to` } });
  await prisma.paymentPlan.create({
    data: {
      userId: holder.id, cadence: "MIN_60_WEEKLY", term: "MONTHLY", installmentAmountCents: 24000, creditsPerInstallment: 8, termMonths: 1, installmentsPaid: 1,
      nextDueDate: new Date(Date.now() + 20 * day), status: "ACTIVE", reservedScheduleId: to.id, reservedChunkIndex: 0,
    },
  });
});
afterAll(async () => {
  await prisma.classBooking.deleteMany({ where: { studentId: { in: [stu.id, holder.id] } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [stu.id, holder.id] } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: [stu.id, holder.id] } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: [from.id, to.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [stu.id, holder.id] } } });
});

async function booking(hoursAhead: number) {
  const at = new Date(Date.now() + hoursAhead * 3_600_000);
  return prisma.classBooking.create({
    data: { studentId: stu.id, scheduleId: from.id, occurrenceDate: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())), scheduledAt: at, creditsSpent: 2 },
  });
}
const target = (daysAhead: number) => {
  const date = dateAt(daysAhead);
  return { ms: date.getTime(), at: computeScheduledAt(to, date, chunksForSchedule(to)[0]) };
};

describe("a weekly time another student's plan keeps", () => {
  it("is shown to the studio apart from the open times, and to everyone else as taken", async () => {
    const forAdmin = (await getUpcomingOccurrences(undefined, { forAdmin: true })).filter((o) => o.scheduleId === to.id);
    expect(forAdmin.length).toBeGreaterThan(0);
    expect(forAdmin.every((o) => o.heldByPlan && !o.isBooked)).toBe(true);
    const forStudent = (await getUpcomingOccurrences(stu.id)).filter((o) => o.scheduleId === to.id);
    expect(forStudent.every((o) => o.isBooked)).toBe(true);
    const forHolder = (await getUpcomingOccurrences(holder.id)).filter((o) => o.scheduleId === to.id);
    expect(forHolder.every((o) => !o.isBooked)).toBe(true);
  });

  it("refuses a move into it, with a typed error the screen can ask about", async () => {
    const b = await booking(48);
    const t = target(10);
    await expect(rescheduleClassBooking(stu.id, b.id, to.id, t.ms, 0, undefined, { byAdmin: true })).rejects.toBeInstanceOf(PlanHoldError);
    expect((await prisma.classBooking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("SCHEDULED");
  });

  it("moves there when the studio confirms, and a student can never override", async () => {
    const b = await booking(96);
    const t = target(17);
    await expect(rescheduleClassBooking(stu.id, b.id, to.id, t.ms, 0, undefined, { overridePlanHold: true })).rejects.toThrow();
    const moved = await rescheduleClassBooking(stu.id, b.id, to.id, t.ms, 0, undefined, { byAdmin: true, overridePlanHold: true });
    expect(moved.scheduledAt.getTime()).toBe(t.at.getTime());
  });
});
