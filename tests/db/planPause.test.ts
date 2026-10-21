import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { pausePaymentPlan, PaymentPlanError } from "@/lib/paymentPlans";
import { newTag, prisma } from "./helpers";

const tag = newTag("pp");
const DAY = 86_400_000;
const userIds: string[] = [];
const slotIds: string[] = [];

async function setup() {
  const email = `${tag}-${userIds.length}@example.test`;
  const user = await prisma.user.create({ data: { email, name: "Pause Tester", passwordHash: "x", emailCanonical: canonicalEmail(email) } });
  userIds.push(user.id);
  const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "11:00", durationMin: 45, creditCost: 2, label: `${tag} ${slotIds.length}` } });
  slotIds.push(slot.id);
  const due = new Date(Date.now() + 20 * DAY);
  const plan = await prisma.paymentPlan.create({
    data: { userId: user.id, cadence: OFFERED_PLAN_CADENCE, term: "MONTHLY", installmentAmountCents: 5500, creditsPerInstallment: 8, termMonths: 1, installmentsPaid: 1, nextDueDate: due, reservedScheduleId: slot.id, reservedChunkIndex: 0 },
  });
  const grant = await prisma.creditGrant.create({ data: { userId: user.id, source: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, creditsGranted: 8, creditsRemaining: 8, expiresAt: due } });
  const soon = new Date(Date.now() + 3 * DAY);
  const late = new Date(Date.now() + 25 * DAY);
  const mk = (when: Date, day: number) =>
    prisma.classBooking.create({ data: { studentId: user.id, scheduleId: slot.id, occurrenceDate: new Date(Date.UTC(2031, 0, day)), scheduledAt: when, status: "SCHEDULED", creditsSpent: 2, reservedByPlanId: plan.id } });
  const inside = await mk(soon, 1);
  const after = await mk(late, 8);
  return { user, plan, grant, due, inside, after };
}

afterAll(async () => {
  await prisma.zellePayment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("pausePaymentPlan", () => {
  it("moves the due date and credit expiry by the span, cancels only classes inside the pause, keeps the slot", async () => {
    const s = await setup();
    const { resumesOn } = await pausePaymentPlan(s.user.id, 2);
    const plan = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: s.plan.id } });
    expect(plan.nextDueDate.getTime()).toBe(s.due.getTime() + 14 * DAY);
    expect(plan.reservedScheduleId).toBe(s.plan.reservedScheduleId);
    expect(plan.status).toBe("ACTIVE");
    expect(plan.pauseUntil?.getTime()).toBe(resumesOn.getTime());
    const grant = await prisma.creditGrant.findUniqueOrThrow({ where: { id: s.grant.id } });
    expect(grant.expiresAt!.getTime()).toBe(s.due.getTime() + 14 * DAY);
    const inside = await prisma.classBooking.findUniqueOrThrow({ where: { id: s.inside.id } });
    const after = await prisma.classBooking.findUniqueOrThrow({ where: { id: s.after.id } });
    expect(inside.status).toBe("CANCELED");
    expect(inside.canceledReason).toBe("Plan paused");
    expect(after.status).toBe("SCHEDULED");
  });

  it("refuses a second pause inside 90 days and a plan with a payment under review", async () => {
    const s = await setup();
    await pausePaymentPlan(s.user.id, 1);
    await expect(pausePaymentPlan(s.user.id, 1)).rejects.toBeInstanceOf(PaymentPlanError);
    const t = await setup();
    await prisma.zellePayment.create({ data: { userId: t.user.id, paymentPlanId: t.plan.id, purpose: "PAYMENT_PLAN_INSTALLMENT", installmentNumber: 2, amountCents: 5500, zelleHandle: "pay@example.com", status: "PENDING_REVIEW" } });
    const before = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: t.plan.id } });
    const open = await prisma.zellePayment.count({ where: { paymentPlanId: t.plan.id, status: "PENDING_REVIEW" } });
    expect(open).toBe(1);
    {
      await expect(pausePaymentPlan(t.user.id, 1)).rejects.toBeInstanceOf(PaymentPlanError);
      const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: t.plan.id } });
      expect(after.nextDueDate.getTime()).toBe(before.nextDueDate.getTime());
    }
  });
});
