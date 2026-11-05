import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { restartPlan, setPlanLength, setPlanPrice, waiveNextBill } from "@/lib/adminPlanTools";
import { addBillingCycles } from "@/lib/billingCycle";
import { newTag, prisma } from "./helpers";

const tag = newTag("apt");
const DAY = 86_400_000;
const emails: string[] = [];

async function account(label: string, role: "STUDENT" | "ADMIN" = "STUDENT") {
  const email = `${tag}-${label}-${emails.length}@example.test`;
  emails.push(email);
  return prisma.user.create({ data: { email, name: "Plan Tester", passwordHash: "x", emailCanonical: canonicalEmail(email), role } });
}

async function setup(over: { installmentsPaid?: number; status?: "ACTIVE" | "CANCELED"; term?: "MONTHLY" | "TERM_3" | "TERM_6"; termMonths?: number } = {}) {
  const admin = await account("admin", "ADMIN");
  const student = await account("student");
  const plan = await prisma.paymentPlan.create({
    data: {
      userId: student.id,
      cadence: "MIN_60_WEEKLY",
      term: over.term ?? "TERM_6",
      installmentAmountCents: 17000,
      creditsPerInstallment: 8,
      termMonths: over.termMonths ?? 6,
      installmentsPaid: over.installmentsPaid ?? 2,
      nextDueDate: new Date(Date.now() + 5 * DAY),
      status: over.status ?? "ACTIVE",
      ...(over.status === "CANCELED" ? { canceledAt: new Date(), cancellationNote: "test" } : {}),
    },
  });
  return { admin, student, plan };
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("the studio's plan tools", () => {
  it("changes the length, keeping the price unless asked, and refuses a length that is already over", async () => {
    const { admin, plan } = await setup();
    await setPlanLength(admin.id, plan.id, "TERM_3", false);
    let after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.term).toBe("TERM_3");
    expect(after.termMonths).toBe(3);
    expect(after.installmentAmountCents).toBe(17000);
    await expect(setPlanLength(admin.id, plan.id, "MONTHLY", false)).rejects.toThrow(/already paid/);
    await setPlanLength(admin.id, plan.id, "TERM_6", true);
    after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.termMonths).toBe(6);
    expect(after.installmentAmountCents).not.toBe(17000);
  });

  it("sets an exact price and closes the unpaid bill at the old one", async () => {
    const { admin, student, plan } = await setup();
    const bill = await prisma.zellePayment.create({ data: { userId: student.id, paymentPlanId: plan.id, purpose: "PAYMENT_PLAN_INSTALLMENT", installmentNumber: 3, amountCents: 17000, zelleHandle: "x", status: "AWAITING_TRANSFER" } });
    await setPlanPrice(admin.id, plan.id, 12000);
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).installmentAmountCents).toBe(12000);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("EXPIRED");
  });

  it("gives the next 28 days free: a $0 bill, the cycle's credits, and the next bill 28 days later", async () => {
    const { admin, student, plan } = await setup();
    const next = await waiveNextBill(admin.id, plan.id);
    expect(Math.abs(next!.getTime() - addBillingCycles(plan.nextDueDate, 1).getTime())).toBeLessThan(1000);
    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.installmentsPaid).toBe(3);
    const waived = await prisma.zellePayment.findFirstOrThrow({ where: { paymentPlanId: plan.id, installmentNumber: 3 } });
    expect(waived.amountCents).toBe(0);
    expect(waived.status).toBe("VERIFIED");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: student.id } })).classCredits).toBe(8);
  });

  it("restarts a canceled plan once, and not on top of another running plan", async () => {
    const { admin, student, plan } = await setup({ status: "CANCELED" });
    const { nextDue } = await restartPlan(admin.id, plan.id);
    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.status).toBe("ACTIVE");
    expect(after.canceledAt).toBeNull();
    expect(nextDue.getTime()).toBe(plan.nextDueDate.getTime());
    await expect(restartPlan(admin.id, plan.id)).rejects.toThrow(/Only a canceled plan/);
    const second = await prisma.paymentPlan.create({ data: { ...plan, id: undefined, status: "CANCELED", createdAt: undefined, updatedAt: undefined } });
    await expect(restartPlan(admin.id, second.id)).rejects.toThrow(/already has a running plan/);
    expect(student.id).toBeTruthy();
  });

  it("will not restart a plan that was part of a group or parent plan", async () => {
    const { admin, student, plan } = await setup({ status: "CANCELED" });
    const group = await prisma.familyPlanGroup.create({ data: { payerId: student.id } });
    await prisma.paymentPlan.update({ where: { id: plan.id }, data: { familyGroupId: group.id } });
    await expect(restartPlan(admin.id, plan.id)).rejects.toThrow(/part of a group/);
    await prisma.paymentPlan.update({ where: { id: plan.id }, data: { familyGroupId: null } });
    await prisma.familyPlanGroup.delete({ where: { id: group.id } });
  });
});
