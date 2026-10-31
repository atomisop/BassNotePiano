import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { changeReservedSlot } from "@/lib/paymentPlans";
import { newTag, prisma } from "./helpers";

const tag = newTag("fw");
const DAY = 86_400_000;

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { startsWith: tag } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.classSchedule.deleteMany({ where: { label: tag } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("a plan with no weekly time yet (a child on a parent's plan)", () => {
  it("can be given one, which books every class in the paid 28 days", async () => {
    const email = `${tag}-kid@example.test`;
    const user = await prisma.user.create({ data: { email, name: "Child", passwordHash: "x", emailCanonical: canonicalEmail(email) } });
    const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 3, startTime: "16:00", durationMin: 45, creditCost: 2, label: tag } });
    const plan = await prisma.paymentPlan.create({
      data: { userId: user.id, cadence: "MIN_60_WEEKLY", term: "TERM_3", installmentAmountCents: 16499, creditsPerInstallment: 8, termMonths: 3, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 27 * DAY) },
    });
    expect(plan.reservedScheduleId).toBeNull();

    await changeReservedSlot(user.id, slot.id, 0);

    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.reservedScheduleId).toBe(slot.id);
    const booked = await prisma.classBooking.count({ where: { studentId: user.id, reservedByPlanId: plan.id, status: "SCHEDULED" } });
    expect(booked).toBeGreaterThanOrEqual(3);
    expect(booked).toBeLessThanOrEqual(4);
  });
});
