import { afterAll, describe, expect, it } from "vitest";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { getMeStatus } from "@/lib/meStatus";
import { newTag, prisma } from "./helpers";

const tag = newTag("bill");
const DAY = 86_400_000;
const emails: string[] = [];

async function account(label: string) {
  const email = `${tag}-${label}-${emails.length}@example.test`;
  emails.push(email);
  return prisma.user.create({ data: { email, name: "Bill Tester", passwordHash: "x", emailCanonical: canonicalEmail(email) } });
}

async function plan(userId: string, familyGroupId?: string) {
  return prisma.paymentPlan.create({
    data: {
      userId,
      cadence: "MIN_60_WEEKLY",
      term: "TERM_6",
      installmentAmountCents: 12999,
      creditsPerInstallment: 8,
      termMonths: 6,
      installmentsPaid: 1,
      nextDueDate: new Date(Date.now() + 2 * DAY),
      status: "ACTIVE",
      familyGroupId,
    },
  });
}

async function bill(userId: string, planId: string, over: { installmentNumber?: number; status?: "AWAITING_TRANSFER" | "PENDING_REVIEW" } = {}) {
  return prisma.zellePayment.create({
    data: {
      userId,
      purpose: "PAYMENT_PLAN_INSTALLMENT",
      amountCents: 12999,
      zelleHandle: "pay@example.test",
      paymentPlanId: planId,
      installmentNumber: over.installmentNumber ?? 2,
      status: over.status ?? "AWAITING_TRANSFER",
    },
  });
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.familyPlanGroup.deleteMany({ where: { payerId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("the bill banner's status", () => {
  it("shows an open renewal bill and sends them to Billing", async () => {
    const student = await account("solo");
    const p = await plan(student.id);
    expect((await getMeStatus(student.id)).billDue).toBeNull();
    await bill(student.id, p.id);
    const due = (await getMeStatus(student.id)).billDue;
    expect(due).toMatchObject({ amountCents: 12999, dueDate: p.nextDueDate.toISOString(), href: "/billing/plans" });
  });

  it("stops once the payment is sent, and never counts a first payment", async () => {
    const sent = await account("sent");
    await bill(sent.id, (await plan(sent.id)).id, { status: "PENDING_REVIEW" });
    expect((await getMeStatus(sent.id)).billDue).toBeNull();

    const starter = await account("starter");
    await bill(starter.id, (await plan(starter.id)).id, { installmentNumber: 1 });
    expect((await getMeStatus(starter.id)).billDue).toBeNull();
  });

  it("on a parent plan, the parent sees the child's bill and the child does not", async () => {
    const parent = await account("parent");
    const child = await account("child");
    const group = await prisma.familyPlanGroup.create({ data: { kind: "PARENT", payerId: parent.id } });
    const p = await plan(child.id, group.id);
    await bill(child.id, p.id);
    expect((await getMeStatus(child.id)).billDue).toBeNull();
    expect((await getMeStatus(parent.id)).billDue?.href).toBe("/parent");
  });

  it("a group plan's bill shows to the payer, never to a member who pays nothing", async () => {
    const payer = await account("payer");
    const member = await account("member");
    const group = await prisma.familyPlanGroup.create({ data: { kind: "FAMILY", payerId: payer.id } });
    const p = await plan(member.id, group.id);
    await bill(member.id, p.id);
    expect((await getMeStatus(payer.id)).billDue?.href).toBe("/billing/plans");
    expect((await getMeStatus(member.id)).billDue).toBeNull();
  });
});
