import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { classesLeftInPaidMonth } from "@/lib/paymentPlans";
import { makeUser, newTag, prisma } from "./helpers";

// A paid month is exactly 4 classes, even when the billing cycle holds five of the student's weekday.
const tag = newTag("fm");
let stu: { id: string }, sched: { id: string };

beforeAll(async () => {
  stu = await makeUser(tag, "Mon Subscriber", { classCredits: 8 });
  sched = await prisma.classSchedule.create({ data: { dayOfWeek: 1, startTime: "17:00", durationMin: 45, creditCost: 2, label: `${tag} Monday` } });
});
afterAll(async () => {
  await prisma.classBooking.deleteMany({ where: { studentId: stu.id } });
  await prisma.paymentPlan.deleteMany({ where: { userId: stu.id } });
  await prisma.classSchedule.delete({ where: { id: sched.id } });
  await prisma.user.deleteMany({ where: { id: stu.id } });
});

describe("a paid month is exactly four classes", () => {
  it("allows four, not five, in a cycle that holds five Mondays (Nov 2 to Dec 2, 2026)", async () => {
    const plan = await prisma.paymentPlan.create({
      data: { userId: stu.id, cadence: "MIN_60_WEEKLY", term: "MONTHLY", installmentAmountCents: 24000, creditsPerInstallment: 8, termMonths: 1, installmentsPaid: 1, nextDueDate: new Date(Date.UTC(2026, 11, 2)), status: "ACTIVE", reservedScheduleId: sched.id, reservedChunkIndex: 0 },
    });
    expect(await classesLeftInPaidMonth(plan)).toBe(4);
    for (const [m, d] of [[11, 2], [11, 9], [11, 16], [11, 23]] as const) {
      await prisma.classBooking.create({
        data: { studentId: stu.id, scheduleId: sched.id, occurrenceDate: new Date(Date.UTC(2026, m - 1, d)), scheduledAt: new Date(Date.UTC(2026, m - 1, d, 22)), creditsSpent: 2, reservedByPlanId: plan.id },
      });
    }
    expect(await classesLeftInPaidMonth(plan)).toBe(0); // Nov 30 is the rest week
  });
});
