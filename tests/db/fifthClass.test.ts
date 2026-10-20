import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { classesInPaidMonth, classesLeftInPaidMonth, ensureFifthClassCredit, topUpIfFifth } from "@/lib/paymentPlans";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("fc");
let stu: { id: string }, sched: { id: string };
const plans: string[] = [];

beforeAll(async () => {
  stu = await makeUser(tag, "Mon Subscriber", { classCredits: 8 });
  sched = await prisma.classSchedule.create({ data: { dayOfWeek: 1, startTime: "17:00", durationMin: 45, creditCost: 2, label: `${tag} Monday` } });
});
afterAll(async () => {
  await prisma.classBooking.deleteMany({ where: { studentId: stu.id } });
  await prisma.creditGrant.deleteMany({ where: { userId: stu.id } });
  await prisma.appSetting.deleteMany({ where: { OR: plans.map((id) => ({ key: { startsWith: `plan-fifth-class:${id}:` } })) } });
  await prisma.paymentPlan.deleteMany({ where: { userId: stu.id } });
  await prisma.classSchedule.delete({ where: { id: sched.id } });
  await prisma.user.deleteMany({ where: { id: stu.id } });
});

async function plan(nextDueDate: Date) {
  const p = await prisma.paymentPlan.create({
    data: { userId: stu.id, cadence: "MIN_60_WEEKLY", term: "MONTHLY", installmentAmountCents: 24000, creditsPerInstallment: 8, termMonths: 1, installmentsPaid: 1, nextDueDate, status: "ACTIVE", reservedScheduleId: sched.id, reservedChunkIndex: 0 },
  });
  plans.push(p.id);
  return p;
}
const monday = (m: number, day: number) => new Date(Date.UTC(2026, m - 1, day, 22));

describe("a paid month holds every one of the student's weekdays", () => {
  it("allows five when the cycle holds five Mondays, four when it holds four", async () => {
    const five = await plan(new Date(Date.UTC(2026, 11, 2))); // Nov 2 to Dec 2
    expect(await classesInPaidMonth(five)).toEqual({ allowed: 5, base: 4 });
    expect(await classesLeftInPaidMonth(five)).toBe(5);
    const four = await plan(new Date(Date.UTC(2027, 0, 2))); // Dec 2 to Jan 2
    expect(await classesInPaidMonth(four)).toEqual({ allowed: 4, base: 4 });
  });

  it("adds the fifth class's credit only when four are already booked, and only once per cycle", async () => {
    const p = await plan(new Date(Date.UTC(2026, 11, 2)));
    const book = (m: number, day: number) =>
      prisma.classBooking.create({
        data: { studentId: stu.id, scheduleId: sched.id, occurrenceDate: new Date(Date.UTC(2026, m - 1, day)), scheduledAt: monday(m, day), creditsSpent: 2, reservedByPlanId: p.id },
      });
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: stu.id } })).classCredits;
    await book(11, 2);
    await book(11, 9);
    await book(11, 16);
    await topUpIfFifth(p, 2); // three booked: the fourth is covered by the installment
    expect((await prisma.user.findUniqueOrThrow({ where: { id: stu.id } })).classCredits).toBe(before);
    await book(11, 23);
    await topUpIfFifth(p, 2); // four booked: the next one is the fifth
    await topUpIfFifth(p, 2);
    await ensureFifthClassCredit(p, 2);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: stu.id } })).classCredits).toBe(before + 2);
    expect(await classesLeftInPaidMonth(p)).toBe(1);
    await book(11, 30);
    expect(await classesLeftInPaidMonth(p)).toBe(0);
  });
});
