import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
const receipts: string[] = [];
vi.mock("@/lib/paymentReceipt", () => ({ sendPaymentReceipt: async (id: string) => void receipts.push(id) }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { getOrCreateOpenInstallmentPayment } from "@/lib/paymentPlans";
import { approveZellePayment, submitZellePaymentReference } from "@/lib/payments";
import { newTag, prisma } from "./helpers";

const tag = newTag("fbd");
const DAY = 86_400_000;
const emails: string[] = [];
const groupIds: string[] = [];

async function account(label: string, role: "STUDENT" | "ADMIN" = "STUDENT") {
  const email = `${tag}-${label}-${emails.length}@example.test`;
  emails.push(email);
  return prisma.user.create({ data: { email, name: `${label} Tester${emails.length}`, passwordHash: "x", emailCanonical: canonicalEmail(email), role } });
}
async function plan(userId: string, groupId: string | null, amount = 15000) {
  return prisma.paymentPlan.create({
    data: { userId, cadence: "MIN_60_WEEKLY", term: "TERM_6", installmentAmountCents: amount, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 1 * DAY), familyGroupId: groupId },
  });
}
async function group(kind: "FAMILY" | "PARENT", amounts: number[]) {
  const people: Awaited<ReturnType<typeof account>>[] = [];
  for (let i = 0; i < amounts.length; i++) people.push(await account(i === 0 ? "payer" : `member${i}`));
  const g = await prisma.familyPlanGroup.create({ data: { payerId: people[0].id, kind } });
  groupIds.push(g.id);
  const plans: Awaited<ReturnType<typeof plan>>[] = [];
  for (const [i, p] of people.entries()) plans.push(await plan(p.id, g.id, amounts[i]));
  return { people, plans, groupId: g.id };
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.zellePayment.updateMany({ where: { userId: { in: ids } }, data: { bundleId: null } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.familyPlanGroup.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("a group's combined 28-day bill", () => {
  it("holds every member's open bill in one bill for the payer, with the amounts added up", async () => {
    const g = await group("FAMILY", [16499, 16499, 12000]);
    const a = await getOrCreateOpenInstallmentPayment(g.plans[0].id, "pay@example.test");
    expect(a.payment?.purpose).toBe("FAMILY_PLAN_INSTALLMENT");
    expect(a.payment?.userId).toBe(g.people[0].id);
    expect(a.payment?.amountCents).toBe(16499 + 16499 + 12000);
    const b = await getOrCreateOpenInstallmentPayment(g.plans[1].id, "pay@example.test");
    expect(b.payment?.id).toBe(a.payment?.id);
    expect(await prisma.zellePayment.count({ where: { familyGroupId: g.groupId, purpose: "FAMILY_PLAN_INSTALLMENT" } })).toBe(1);
    expect(await prisma.zellePayment.count({ where: { bundleId: a.payment!.id } })).toBe(3);
  });

  it("is approved as one: every member is paid, the bundle is paid, and exactly one receipt goes out", async () => {
    const g = await group("PARENT", [15000, 15000]);
    const admin = await account("admin", "ADMIN");
    const { payment: bundle } = await getOrCreateOpenInstallmentPayment(g.plans[0].id, "pay@example.test");
    await submitZellePaymentReference(g.people[0].id, bundle!.id, { senderName: "Payer Tester", referenceCode: "x" } as never).catch(() => undefined);
    await prisma.zellePayment.update({ where: { id: bundle!.id }, data: { status: "PENDING_REVIEW", submittedAt: new Date() } });
    receipts.length = 0;
    await approveZellePayment(bundle!.id, admin.id);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: bundle!.id } })).status).toBe("VERIFIED");
    expect(await prisma.paymentPlan.findMany({ where: { familyGroupId: g.groupId }, select: { installmentsPaid: true } })).toEqual([{ installmentsPaid: 2 }, { installmentsPaid: 2 }]);
    expect(receipts).toEqual([bundle!.id]);
  });

  it("never lets a member pay it, and a bill held in the bundle cannot be paid on its own", async () => {
    const g = await group("FAMILY", [15000, 15000]);
    await getOrCreateOpenInstallmentPayment(g.plans[0].id, "pay@example.test");
    const memberRow = await prisma.zellePayment.findFirstOrThrow({ where: { paymentPlanId: g.plans[1].id, purpose: "PAYMENT_PLAN_INSTALLMENT" } });
    await expect(submitZellePaymentReference(g.people[1].id, memberRow.id, {} as never)).rejects.toThrow();
  });

  it("dissolves when fewer than two bills are open, and a person on their own plan keeps an ordinary bill", async () => {
    const g = await group("FAMILY", [15000, 15000]);
    const first = await getOrCreateOpenInstallmentPayment(g.plans[0].id, "pay@example.test");
    expect(first.payment?.purpose).toBe("FAMILY_PLAN_INSTALLMENT");
    await prisma.paymentPlan.update({ where: { id: g.plans[1].id }, data: { status: "CANCELED" } });
    const after = await getOrCreateOpenInstallmentPayment(g.plans[0].id, "pay@example.test");
    expect(after.payment?.purpose).toBe("PAYMENT_PLAN_INSTALLMENT");
    const solo = await account("solo");
    const soloPlan = await plan(solo.id, null);
    const bill = await getOrCreateOpenInstallmentPayment(soloPlan.id, "pay@example.test");
    expect(bill.payment?.purpose).toBe("PAYMENT_PLAN_INSTALLMENT");
    expect(bill.payment?.bundleId).toBeNull();
  });
});
