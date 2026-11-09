import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
const invoices: { to: string; amountCents: number; planLabel: string; installmentLabel: string; cta: { url: string }; unsubscribe?: { userId: string } }[] = [];
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, sendPaymentPlanInvoiceEmail: async (to: string, details: Omit<(typeof invoices)[number], "to">) => void invoices.push({ to, ...details }) };
});
import { canonicalEmail } from "@/lib/canonicalEmail";
import { getOrCreateOpenInstallmentPayment, resendPlanInvoice } from "@/lib/paymentPlans";
import { newTag, prisma } from "./helpers";

const tag = newTag("rbp");
const DAY = 86_400_000;
const emails: string[] = [];
const groupIds: string[] = [];

async function account(label: string) {
  const email = `${tag}-${label}-${emails.length}@example.test`;
  emails.push(email);
  return prisma.user.create({ data: { email, name: `${label} Tester${emails.length}`, passwordHash: "x", emailCanonical: canonicalEmail(email) } });
}
async function plan(userId: string, groupId: string | null, amount: number) {
  return prisma.paymentPlan.create({
    data: { userId, cadence: "MIN_60_WEEKLY", term: "TERM_6", installmentAmountCents: amount, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 1, nextDueDate: new Date(Date.now() + DAY), familyGroupId: groupId },
  });
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.zellePayment.updateMany({ where: { userId: { in: ids } }, data: { bundleId: null } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.familyPlanGroup.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("Resend bill reaches the person who pays", () => {
  it("sends a solo plan's bill to its own person, as before", async () => {
    const solo = await account("solo");
    const p = await plan(solo.id, null, 16499);
    await getOrCreateOpenInstallmentPayment(p.id, "pay@example.test");
    invoices.length = 0;
    expect(await resendPlanInvoice(p.id)).toBe("sent");
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ to: solo.email, amountCents: 16499, unsubscribe: { userId: solo.id } });
    expect(invoices[0].cta.url).toMatch(/\/billing\/plans$/);
  });

  it("sends a child's bill on a parent plan to the parent, with the child's name and the parent's pay page", async () => {
    const parent = await account("parent");
    const child = await account("child");
    const g = await prisma.familyPlanGroup.create({ data: { payerId: parent.id, kind: "PARENT" } });
    groupIds.push(g.id);
    const p = await plan(child.id, g.id, 15000);
    const { payment } = await getOrCreateOpenInstallmentPayment(p.id, "pay@example.test");
    invoices.length = 0;
    expect(await resendPlanInvoice(p.id)).toBe("sent");
    expect(invoices).toHaveLength(1);
    expect(invoices[0].to).toBe(parent.email);
    expect(invoices[0].amountCents).toBe(payment!.amountCents);
    expect(invoices[0].planLabel).toContain(child.name!);
    expect(invoices[0].cta.url).toMatch(/\/parent$/);
    expect(invoices[0].unsubscribe?.userId).toBe(parent.id);
  });

  it("asks a group's payer for the combined bill, not the member's part", async () => {
    const payer = await account("payer");
    const member = await account("member");
    const g = await prisma.familyPlanGroup.create({ data: { payerId: payer.id, kind: "FAMILY" } });
    groupIds.push(g.id);
    await plan(payer.id, g.id, 16499);
    const memberPlan = await plan(member.id, g.id, 12000);
    const { payment } = await getOrCreateOpenInstallmentPayment(memberPlan.id, "pay@example.test");
    expect(payment?.purpose).toBe("FAMILY_PLAN_INSTALLMENT");
    invoices.length = 0;
    expect(await resendPlanInvoice(memberPlan.id)).toBe("sent");
    expect(invoices[0]).toMatchObject({ to: payer.email, amountCents: 16499 + 12000, planLabel: "Combined bill for 2 people" });
  });

  it("respects the payer's own payments switch", async () => {
    const parent = await account("quiet");
    await prisma.user.update({ where: { id: parent.id }, data: { notifyEmailPayments: false } });
    const child = await account("kid");
    const g = await prisma.familyPlanGroup.create({ data: { payerId: parent.id, kind: "PARENT" } });
    groupIds.push(g.id);
    const p = await plan(child.id, g.id, 15000);
    await getOrCreateOpenInstallmentPayment(p.id, "pay@example.test");
    invoices.length = 0;
    expect(await resendPlanInvoice(p.id)).toBe("opted-out");
    expect(invoices).toHaveLength(0);
  });
});
