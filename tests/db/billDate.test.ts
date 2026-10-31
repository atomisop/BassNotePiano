import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { changePlanBillDate } from "@/lib/paymentPlans";
import { etDayKey } from "@/lib/fingerPractice";
import { day, makeUser, newTag, prisma } from "./helpers";

const tag = newTag("bd");
let admin: { id: string }, stu: { id: string };
const keyIn = (days: number) => etDayKey(new Date(Date.now() + days * day));

async function plan(extra: Record<string, unknown> = {}) {
  return prisma.paymentPlan.create({
    data: { userId: stu.id, cadence: "MIN_60_WEEKLY", term: "TERM_6", installmentAmountCents: 12099, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 52 * day), status: "ACTIVE", ...extra },
  });
}

beforeAll(async () => {
  admin = await makeUser(tag, "Owner", { role: "ADMIN" });
  stu = await makeUser(tag, "Bill Student");
});
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: admin.id } });
  await prisma.notification.deleteMany({ where: { userId: stu.id } });
  await prisma.mailMessage.deleteMany({ where: { userId: stu.id } });
  await prisma.zellePayment.deleteMany({ where: { userId: stu.id } });
  await prisma.paymentPlan.deleteMany({ where: { userId: stu.id } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, stu.id] } } });
});

describe("moving a plan's next bill", () => {
  it("moves only the bill date, keeps its time of day, closes the old unpaid bill and records it", async () => {
    const p = await plan();
    const oldBill = await prisma.zellePayment.create({
      data: { userId: stu.id, paymentPlanId: p.id, purpose: "PAYMENT_PLAN_INSTALLMENT", installmentNumber: 2, amountCents: 12099, zelleHandle: "pay@example.com", status: "AWAITING_TRANSFER" },
    });
    const target = keyIn(25);
    const { to } = await changePlanBillDate(p.id, admin.id, target);

    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: p.id } });
    expect(etDayKey(after.nextDueDate)).toBe(target);
    expect(after.nextDueDate.getTime()).toBe(to.getTime());
    expect(after.nextDueDate.getUTCMinutes()).toBe(p.nextDueDate.getUTCMinutes());
    expect(after.installmentsPaid).toBe(1);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: oldBill.id } })).status).toBe("EXPIRED");
    expect(await prisma.auditLog.count({ where: { actorId: admin.id, action: "plan.bill-date", targetId: p.id } })).toBe(1);
    expect(await prisma.mailMessage.count({ where: { userId: stu.id, title: "Your next payment date changed" } })).toBe(1);
    await prisma.paymentPlan.update({ where: { id: p.id }, data: { status: "CANCELED" } });
  });

  it("refuses a day in the past and a paused plan", async () => {
    const p = await plan();
    await expect(changePlanBillDate(p.id, admin.id, keyIn(-2))).rejects.toThrow(/today or a later day/);
    await prisma.paymentPlan.update({ where: { id: p.id }, data: { pausedAt: new Date(), pauseUntil: new Date(Date.now() + 7 * day) } });
    await expect(changePlanBillDate(p.id, admin.id, keyIn(20))).rejects.toThrow(/paused/);
    await prisma.paymentPlan.update({ where: { id: p.id }, data: { status: "CANCELED" } });
  });
});
