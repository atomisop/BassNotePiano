import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { OFFERED_PLAN_CADENCE, calculateFamilyBundleTotal } from "@/lib/classCreditPricing";
import { createFamilyPlans, getOrCreateOpenInstallmentPayment, lapsePlanForNonPayment, changePaymentPlanTerm, PaymentPlanError } from "@/lib/paymentPlans";
import { approveZellePayment, submitZellePaymentReference } from "@/lib/payments";
import { ingestPaymentEmail } from "@/lib/paymentEmail";
import { paymentReferenceCode } from "@/lib/paymentReference";
import { newTag, prisma } from "./helpers";

const tag = newTag("fp");
const userIds: string[] = [];
const slotIds: string[] = [];

async function newSlot() {
  const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "11:00", durationMin: 45, creditCost: 2, label: `${tag} slot ${slotIds.length}` } });
  slotIds.push(slot.id);
  return slot.id;
}

async function account(label: string, name: string) {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name, passwordHash: "x", emailCanonical: canonicalEmail(email) } });
  userIds.push(u.id);
  return u;
}

async function family(term: "MONTHLY" | "TERM_3" = "MONTHLY", emails?: string[], payerId?: string, slotId?: string) {
  const payer = payerId ? { id: payerId } : await account(`payer${userIds.length}`, "Parent Tester");
  const kid = emails ? null : await account(`kid${userIds.length}`, "Child Tester");
  return createFamilyPlans({
    payerId: payer.id,
    cadence: OFFERED_PLAN_CADENCE,
    term,
    zelleHandle: "pay@example.com",
    reservedScheduleId: slotId ?? (await newSlot()),
    reservedChunkIndex: 0,
    memberEmails: emails ?? [kid!.email],
  });
}

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.zellePayment.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { familyGroup: { payerId: { in: userIds } } }] } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.familyPlanGroup.deleteMany({ where: { payerId: { in: userIds } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("starting a family plan", () => {
  it("creates one plan per person on one weekly time, and ONE combined first payment from the payer", async () => {
    const { group, plans, startPayment } = await family();
    expect(plans).toHaveLength(2);
    expect(new Set(plans.map((p) => `${p.reservedScheduleId}:${p.reservedChunkIndex}`)).size).toBe(1);
    expect(plans.every((p) => p.familyGroupId === group.id && p.installmentsPaid === 0)).toBe(true);
    const each = calculateFamilyBundleTotal(OFFERED_PLAN_CADENCE, "MONTHLY", 2).perStudentMonthlyCents;
    expect(plans.every((p) => p.installmentAmountCents === each)).toBe(true);
    expect(startPayment.purpose).toBe("FAMILY_PLAN_START");
    expect(startPayment.userId).toBe(group.payerId);
    expect(startPayment.amountCents).toBe(each * 2);
    // A member never gets a first bill of their own.
    for (const plan of plans) expect((await getOrCreateOpenInstallmentPayment(plan.id, "pay@example.com")).payment).toBeNull();
  });

  it("starts nobody when one member cannot start", async () => {
    const payer = await account("p-busy", "Busy Parent");
    const kid = await account("k-busy", "Busy Kid");
    await prisma.paymentPlan.create({
      data: { userId: kid.id, cadence: OFFERED_PLAN_CADENCE, term: "MONTHLY", installmentAmountCents: 100, creditsPerInstallment: 8, termMonths: 1, nextDueDate: new Date(), status: "ACTIVE" },
    });
    await expect(family("MONTHLY", [kid.email], payer.id)).rejects.toBeInstanceOf(PaymentPlanError);
    expect(await prisma.familyPlanGroup.count({ where: { payerId: payer.id } })).toBe(0);
    expect(await prisma.paymentPlan.count({ where: { userId: payer.id } })).toBe(0);
    expect(await prisma.zellePayment.count({ where: { userId: payer.id } })).toBe(0);
  });

  it("refuses a missing account, two accounts with the same name, and a second family for the same payer", async () => {
    const payer = await account("p-rules", "Rules Parent");
    await expect(family("MONTHLY", [`${tag}-nobody@example.test`], payer.id)).rejects.toThrow(/do not have/);
    const twin = await account("twin", "Rules Parent");
    await expect(family("MONTHLY", [twin.email], payer.id)).rejects.toThrow(/same name/);
    const kid = await account("k-rules", "Rules Kid");
    await family("MONTHLY", [kid.email], payer.id);
    const kid2 = await account("k-rules2", "Other Kid");
    await expect(family("MONTHLY", [kid2.email], payer.id)).rejects.toThrow(/already/);
  });
});

describe("the combined first payment", () => {
  it("starts every member's plan in one approval, with their credits, and counts as the only revenue row", async () => {
    const { plans, startPayment, group } = await family();
    await submitZellePaymentReference(group.payerId, startPayment.id, { senderName: "Parent Tester" });
    await approveZellePayment(startPayment.id, null);
    const after = await prisma.paymentPlan.findMany({ where: { familyGroupId: group.id }, orderBy: { createdAt: "asc" } });
    expect(after.every((p) => p.installmentsPaid >= 1)).toBe(true);
    for (const plan of plans) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: plan.userId } });
      expect(user.classCredits).toBe(plan.creditsPerInstallment);
    }
    expect(await prisma.zellePayment.count({ where: { OR: [{ familyGroupId: group.id }, { paymentPlanId: { in: plans.map((p) => p.id) } }], status: "VERIFIED" } })).toBe(1);
  });

  it("is not paid for a member's later bill by anyone but the payer (the payer may submit it)", async () => {
    const { plans, startPayment, group } = await family();
    await submitZellePaymentReference(group.payerId, startPayment.id, { senderName: "Parent Tester" });
    await approveZellePayment(startPayment.id, null);
    const kidPlan = plans.find((p) => p.userId !== group.payerId)!;
    // Open the member's next bill and let the payer, not the member, submit it.
    await prisma.paymentPlan.update({ where: { id: kidPlan.id }, data: { nextDueDate: new Date() } });
    const { payment } = await getOrCreateOpenInstallmentPayment(kidPlan.id, "pay@example.com");
    expect(payment).not.toBeNull();
    await expect(submitZellePaymentReference(group.payerId, payment!.id, { senderName: "Parent Tester" })).resolves.toBeDefined();
  });
});

describe("who can pay for a family", () => {
  const sofi = (id: string, name: string, cents: number, note: string) =>
    ingestPaymentEmail({
      messageId: `<${tag}-${id}@sofi.org>`,
      from: "SoFi <no-reply@o.sofi.org>",
      subject: "Money is on its way",
      body: `Hi,\nThe $${(cents / 100).toFixed(2)} sent to you by ${name} will be automatically deposited to your account.\n${note}\nSoFi is not responsible for the content.`,
    });

  it("a second account cannot settle the combined first payment even with the code; the payer does and everyone starts", async () => {
    const { plans, startPayment, group } = await family();
    const code = paymentReferenceCode(startPayment.id);
    await sofi("other", "CHILD TESTER", startPayment.amountCents, code);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: startPayment.id } })).status).not.toBe("VERIFIED");
    expect(await prisma.paymentPlan.count({ where: { familyGroupId: group.id, installmentsPaid: { gt: 0 } } })).toBe(0);

    await sofi("payer", "PARENT TESTER", startPayment.amountCents, code);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: startPayment.id } })).status).toBe("VERIFIED");
    expect(await prisma.paymentPlan.count({ where: { familyGroupId: group.id, installmentsPaid: 1 } })).toBe(plans.length);
  });
});

describe("a family that never starts ends together", () => {
  it("lapsing one member's plan cancels everyone's and closes the combined payment", async () => {
    const { plans, startPayment, group } = await family();
    expect(await lapsePlanForNonPayment(plans[0].id, { firstBill: true })).toBe(true);
    const after = await prisma.paymentPlan.findMany({ where: { familyGroupId: group.id } });
    expect(after.every((p) => p.status === "CANCELED")).toBe(true);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: startPayment.id } })).status).toBe("EXPIRED");
  });

  it("does not lapse while the combined payment is being confirmed", async () => {
    const { plans, startPayment, group } = await family();
    await submitZellePaymentReference(group.payerId, startPayment.id, { senderName: "Parent Tester" });
    expect(await lapsePlanForNonPayment(plans[0].id, { firstBill: true })).toBe(false);
  });
});

describe("members cannot change a family plan on their own", () => {
  it("refuses a term change", async () => {
    const { plans } = await family();
    await expect(changePaymentPlanTerm(plans[1].userId, "TERM_3")).rejects.toThrow(/family plan/i);
  });
});
