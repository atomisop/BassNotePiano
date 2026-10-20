import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { bookClass, getUpcomingOccurrences, nextOccurrenceDates } from "@/lib/classSchedule";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("uh");
const userIds: string[] = [];
let schedule: { id: string };
let owner: { id: string }, other: { id: string };
let planId: string;

beforeAll(async () => {
  owner = await makeUser(tag, "Unpaid Owner", { classCredits: 0 });
  other = await makeUser(tag, "Other Student", { classCredits: 100 });
  userIds.push(owner.id, other.id);
  schedule = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "15:00", durationMin: 45, creditCost: 2, label: `${tag} Tuesday` } });
  // A plan that was just set up: ACTIVE, weekly hour reserved, nothing paid yet (the first bill is still awaiting transfer).
  const plan = await prisma.paymentPlan.create({
    data: {
      userId: owner.id,
      cadence: "MIN_60_WEEKLY",
      term: "MONTHLY",
      installmentAmountCents: 16500,
      creditsPerInstallment: 4,
      termMonths: 1,
      installmentsPaid: 0,
      nextDueDate: new Date(),
      reservedScheduleId: schedule.id,
      reservedChunkIndex: 0,
      installmentPayments: {
        create: [{ userId: owner.id, purpose: "PAYMENT_PLAN_INSTALLMENT", amountCents: 16500, zelleHandle: "pay@example.com", lessonQuantity: 4, installmentNumber: 1, status: "AWAITING_TRANSFER" }],
      },
    },
  });
  planId = plan.id;
});

afterAll(async () => {
  await prisma.zellePayment.deleteMany({ where: { paymentPlanId: planId } });
  await prisma.paymentPlan.deleteMany({ where: { id: planId } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.classSchedule.deleteMany({ where: { id: schedule.id } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("a plan that has not paid yet still holds its weekly hour", () => {
  it("refuses another student who tries to book that hour", async () => {
    const date = nextOccurrenceDates(2, 8)[1];
    await expect(bookClass(other.id, schedule.id, date.getTime(), 0, 2)).rejects.toThrow(/reserved for another student's payment plan/);
    expect(await prisma.classBooking.count({ where: { scheduleId: schedule.id } })).toBe(0);
  });

  it("shows that hour as reserved on the booking screen even though no class is booked on it yet", async () => {
    const mine = (await getUpcomingOccurrences()).filter((o) => o.scheduleId === schedule.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((o) => o.isReserved && !o.isBooked)).toBe(true);
  });

  it("lets the hour go once the plan is canceled (for example, the first bill lapsed)", async () => {
    await prisma.paymentPlan.update({ where: { id: planId }, data: { status: "CANCELED", canceledAt: new Date(), cancellationReason: "NON_PAYMENT" } });
    const mine = (await getUpcomingOccurrences()).filter((o) => o.scheduleId === schedule.id);
    expect(mine.every((o) => !o.isReserved)).toBe(true);
    const date = nextOccurrenceDates(2, 8)[2];
    await expect(bookClass(other.id, schedule.id, date.getTime(), 0, 2)).resolves.toBeTruthy();
  });
});
