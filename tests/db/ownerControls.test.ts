import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { cancelOpenBill, refundZellePayment, undoRefundZellePayment } from "@/lib/payments";
import { setPlanProgress } from "@/lib/adminPlanTools";
import { newTag, prisma } from "./helpers";

const tag = newTag("oct");
const DAY = 86_400_000;
const emails: string[] = [];

async function account(label: string, role: "STUDENT" | "ADMIN" = "STUDENT") {
  const email = `${tag}-${label}-${emails.length}@example.test`;
  emails.push(email);
  return prisma.user.create({ data: { email, name: `${label} Tester${emails.length}`, passwordHash: "x", emailCanonical: canonicalEmail(email), role, classCredits: 16 } });
}
async function planFor(userId: string, paid = 2) {
  return prisma.paymentPlan.create({
    data: { userId, cadence: "MIN_60_WEEKLY", term: "TERM_6", installmentAmountCents: 12099, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: paid, nextDueDate: new Date(Date.now() + 20 * DAY) },
  });
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.creditAdjustment.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("rewinding a refund", () => {
  it("makes the payment count as paid again, and puts back the credits and the plan when asked", async () => {
    const admin = await account("admin", "ADMIN");
    const student = await account("student");
    const plan = await planFor(student.id);
    const pay = await prisma.zellePayment.create({
      data: { userId: student.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 2, amountCents: 12099, lessonQuantity: 8, zelleHandle: "t", status: "VERIFIED", reviewedAt: new Date() },
    });
    await refundZellePayment(pay.id, { id: admin.id, email: admin.email }, { note: "mistake", removeCredits: true, cancelPlan: true });
    const refunded = await prisma.zellePayment.findUniqueOrThrow({ where: { id: pay.id } });
    expect(refunded.status).toBe("REFUNDED");
    const creditsAfterRefund = (await prisma.user.findUniqueOrThrow({ where: { id: student.id } })).classCredits;
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe("CANCELED");

    await undoRefundZellePayment(pay.id, { id: admin.id, email: admin.email }, { restoreCredits: true, reactivatePlan: true });
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe("VERIFIED");
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe("ACTIVE");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: student.id } })).classCredits).toBe(creditsAfterRefund + 8);
    await expect(undoRefundZellePayment(pay.id, { id: admin.id, email: admin.email }, { restoreCredits: true, reactivatePlan: true })).rejects.toThrow();
  });
});

describe("cancelling an unpaid bill", () => {
  it("closes it as expired and refuses one that was paid", async () => {
    const admin = await account("admin", "ADMIN");
    const student = await account("student");
    const open = await prisma.zellePayment.create({ data: { userId: student.id, purpose: "CLASS_CREDITS", lessonQuantity: 2, amountCents: 5000, zelleHandle: "t", status: "AWAITING_TRANSFER" } });
    await cancelOpenBill(open.id, { id: admin.id, email: admin.email });
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: open.id } })).status).toBe("EXPIRED");
    const paid = await prisma.zellePayment.create({ data: { userId: student.id, purpose: "CLASS_CREDITS", lessonQuantity: 2, amountCents: 5000, zelleHandle: "t", status: "VERIFIED" } });
    await expect(cancelOpenBill(paid.id, { id: admin.id, email: admin.email })).rejects.toThrow();
  });
});

describe("plan progress", () => {
  it("sets bills paid and a past next bill date, closes unpaid bills, and can finish or reopen a plan", async () => {
    const admin = await account("admin", "ADMIN");
    const student = await account("student");
    const plan = await planFor(student.id, 2);
    const open = await prisma.zellePayment.create({ data: { userId: student.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 3, amountCents: 12099, zelleHandle: "t", status: "AWAITING_TRANSFER" } });
    const past = new Date(Date.now() - 10 * DAY).toISOString().slice(0, 10);
    await setPlanProgress(admin.id, plan.id, { billsPaid: 1, nextBillDay: past });
    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.installmentsPaid).toBe(1);
    expect(after.status).toBe("ACTIVE");
    expect(after.nextDueDate.getTime()).toBeLessThan(Date.now());
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: open.id } })).status).toBe("EXPIRED");
    await setPlanProgress(admin.id, plan.id, { billsPaid: 6, nextBillDay: past });
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe("COMPLETED");
    await setPlanProgress(admin.id, plan.id, { billsPaid: 2, nextBillDay: past });
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe("ACTIVE");
    await expect(setPlanProgress(admin.id, plan.id, { billsPaid: 9, nextBillDay: past })).rejects.toThrow();
  });
});
