import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { applyMoneyFix, findMoneyIssues } from "@/lib/moneyCheck";
import { newTag, prisma } from "./helpers";

const tag = newTag("mck");
const DAY = 86_400_000;
const emails: string[] = [];

async function account(label: string, role: "STUDENT" | "ADMIN" = "STUDENT") {
  const email = `${tag}-${label}-${emails.length}@example.test`;
  emails.push(email);
  return prisma.user.create({ data: { email, name: `${label} Tester${emails.length}`, passwordHash: "x", emailCanonical: canonicalEmail(email), role } });
}
const mine = async (ids: string[]) => (await findMoneyIssues()).filter((i) => ids.includes(i.personId));

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("the money check", () => {
  it("finds a plan that counts a refunded bill, and the fix puts it right", async () => {
    const admin = await account("admin", "ADMIN");
    const s = await account("student");
    const plan = await prisma.paymentPlan.create({ data: { userId: s.id, cadence: "MIN_60_WEEKLY", term: "TERM_6", installmentAmountCents: 12099, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 2, nextDueDate: new Date(Date.now() + 20 * DAY) } });
    await prisma.zellePayment.create({ data: { userId: s.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 1, amountCents: 12099, zelleHandle: "t", status: "VERIFIED" } });
    await prisma.zellePayment.create({ data: { userId: s.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 2, amountCents: 12099, zelleHandle: "t", status: "REFUNDED" } });
    const found = await mine([s.id]);
    expect(found).toHaveLength(1);
    expect(found[0].fixes.map((f) => f.id)).toEqual(["setPaid", "undoRefund"]);
    await applyMoneyFix({ id: admin.id, email: admin.email }, found[0].key, "setPaid");
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).installmentsPaid).toBe(1);
    expect(await mine([s.id])).toHaveLength(0);
    await expect(applyMoneyFix({ id: admin.id, email: admin.email }, found[0].key, "setPaid")).rejects.toThrow();
  });

  it("finds an unpaid bill nobody owes and closes it", async () => {
    const admin = await account("admin", "ADMIN");
    const s = await account("student");
    const plan = await prisma.paymentPlan.create({ data: { userId: s.id, cadence: "MIN_60_WEEKLY", term: "TERM_6", installmentAmountCents: 12099, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 20 * DAY) } });
    await prisma.zellePayment.create({ data: { userId: s.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 1, amountCents: 12099, zelleHandle: "t", status: "VERIFIED" } });
    const stale = await prisma.zellePayment.create({ data: { userId: s.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 1, amountCents: 12099, zelleHandle: "t", status: "AWAITING_TRANSFER" } });
    const found = await mine([s.id]);
    expect(found.map((f) => f.key)).toEqual([`stale:${stale.id}`]);
    await applyMoneyFix({ id: admin.id, email: admin.email }, found[0].key, "closeBill");
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("EXPIRED");
  });

  it("says nothing about a plan that adds up", async () => {
    const s = await account("student");
    const plan = await prisma.paymentPlan.create({ data: { userId: s.id, cadence: "MIN_60_WEEKLY", term: "TERM_6", installmentAmountCents: 12099, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 20 * DAY) } });
    await prisma.zellePayment.create({ data: { userId: s.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 1, amountCents: 12099, zelleHandle: "t", status: "VERIFIED" } });
    expect(await mine([s.id])).toHaveLength(0);
  });
});
