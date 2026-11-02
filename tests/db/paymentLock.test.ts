import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { lapsePlanForNonPayment } from "@/lib/paymentPlans";
import { liftPaymentLock } from "@/lib/paymentLock";
import { newTag, prisma } from "./helpers";

const tag = newTag("plock");
const DAY = 86_400_000;
const emails: string[] = [];

async function account(label: string, role: "STUDENT" | "ADMIN" = "STUDENT") {
  const email = `${tag}-${label}-${emails.length}@example.test`;
  emails.push(email);
  return prisma.user.create({ data: { email, name: "Lock Tester", passwordHash: "x", emailCanonical: canonicalEmail(email), role } });
}

async function latePlan(userId: string, installmentsPaid: number, familyGroupId?: string) {
  return prisma.paymentPlan.create({
    data: {
      userId,
      cadence: "MIN_60_WEEKLY",
      term: "TERM_6",
      installmentAmountCents: 12999,
      creditsPerInstallment: 8,
      termMonths: 6,
      installmentsPaid,
      nextDueDate: new Date(Date.now() - 8 * DAY),
      status: "ACTIVE",
      familyGroupId,
    },
  });
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: ids } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.familyPlanGroup.deleteMany({ where: { payerId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("the non-payment lock", () => {
  it("locks and signs out the person whose renewal bill went unpaid, and only an admin lifts it", async () => {
    const student = await account("late");
    const admin = await account("admin", "ADMIN");
    const p = await latePlan(student.id, 2);
    expect(await lapsePlanForNonPayment(p.id)).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(after.paymentLockedAt).not.toBeNull();
    expect(after.sessionVersion).toBe(student.sessionVersion + 1);
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("CANCELED");

    expect(await liftPaymentLock({ id: admin.id, email: admin.email }, student.id)).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: student.id } })).paymentLockedAt).toBeNull();
  });

  it("does not lock someone whose first bill never arrived", async () => {
    const starter = await account("starter");
    const p = await latePlan(starter.id, 0);
    expect(await lapsePlanForNonPayment(p.id, { firstBill: true })).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: starter.id } })).paymentLockedAt).toBeNull();
  });

  it("on a parent plan, locks the parent who pays, not the child", async () => {
    const parent = await account("parent");
    const child = await account("child");
    const group = await prisma.familyPlanGroup.create({ data: { kind: "PARENT", payerId: parent.id } });
    const p = await latePlan(child.id, 3, group.id);
    expect(await lapsePlanForNonPayment(p.id)).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: parent.id } })).paymentLockedAt).not.toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: child.id } })).paymentLockedAt).toBeNull();
  });
});
