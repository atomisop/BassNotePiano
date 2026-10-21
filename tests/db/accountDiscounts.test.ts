import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { AccountDiscountError, clearAccountDiscount, getDiscountPercent, listAccountDiscounts, setAccountDiscount } from "@/lib/accountDiscounts";
import { changePaymentPlanTerm, createPaymentPlan } from "@/lib/paymentPlans";
import { OFFERED_PLAN_CADENCE, calculatePaymentPlanRate, discountedPlanPriceCents } from "@/lib/classCreditPricing";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ad");
const userIds: string[] = [];
const slotIds: string[] = [];
let admin: { id: string; email: string };

async function student(name: string) {
  const u = await makeUser(tag, name);
  userIds.push(u.id);
  return u;
}

async function runningPlan(userId: string, extra: Record<string, unknown> = {}) {
  return prisma.paymentPlan.create({
    data: { userId, cadence: "MIN_60_WEEKLY", term: "MONTHLY", installmentAmountCents: 21999, creditsPerInstallment: 8, termMonths: 1, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 5 * 86_400_000), status: "ACTIVE", ...extra },
  });
}

const actor = () => ({ id: admin.id, email: admin.email });

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
  await prisma.zellePayment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.accountDiscount.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { action: { startsWith: "pricing.discount" }, actorId: admin?.id } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [...userIds, ...(admin ? [admin.id] : [])] } } });
});

describe("a personal discount", () => {
  it("rewrites the running solo plan and its unpaid bill, then restores the original price when removed", async () => {
    admin = (await makeUser(tag, "Owner", { role: "ADMIN" })) as unknown as typeof admin;
    const stu = await student("Maria");
    const plan = await runningPlan(stu.id);
    const bill = await prisma.zellePayment.create({ data: { userId: stu.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 2, amountCents: 21999, zelleHandle: "pay@example.com", status: "AWAITING_TRANSFER" } });

    const set = await setAccountDiscount({ userId: stu.id, percent: 25, note: "Friend of the studio", actor: actor() });
    expect(set.planChange).toMatchObject({ fromCents: 21999, toCents: 16499, openBillChanged: true });
    const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.installmentAmountCents).toBe(16499);
    expect(after.listAmountCents).toBe(21999);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: bill.id } })).amountCents).toBe(16499);
    expect(await getDiscountPercent(stu.id)).toBe(25);
    // The notice goes to their Mail (plan and billing notices are routed there), or the bell.
    expect((await prisma.notification.count({ where: { userId: stu.id } })) + (await prisma.mailMessage.count({ where: { userId: stu.id } }))).toBeGreaterThan(0);

    // Changing the percent works from the ORIGINAL price, not the already discounted one.
    await setAccountDiscount({ userId: stu.id, percent: 10, actor: actor() });
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).installmentAmountCents).toBe(discountedPlanPriceCents(21999, 10));

    const cleared = await clearAccountDiscount({ userId: stu.id, actor: actor() });
    expect(cleared.planChange?.toCents).toBe(21999);
    const restored = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(restored).toMatchObject({ installmentAmountCents: 21999, listAmountCents: null });
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: bill.id } })).amountCents).toBe(21999);
    expect(await getDiscountPercent(stu.id)).toBe(0);
  });

  it("leaves a bill that was already sent for review, and a paid bill, alone", async () => {
    const stu = await student("Reviewed");
    const plan = await runningPlan(stu.id);
    const inReview = await prisma.zellePayment.create({ data: { userId: stu.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 2, amountCents: 21999, zelleHandle: "p", status: "PENDING_REVIEW", submittedAt: new Date() } });
    const paid = await prisma.zellePayment.create({ data: { userId: stu.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 1, amountCents: 21999, zelleHandle: "p", status: "VERIFIED" } });
    const res = await setAccountDiscount({ userId: stu.id, percent: 30, actor: actor() });
    expect(res.planChange?.openBillChanged).toBe(false);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: inReview.id } })).amountCents).toBe(21999);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: paid.id } })).amountCents).toBe(21999);
  });

  it("does not touch a family plan, and refuses an admin, a bad percent or a missing account", async () => {
    const stu = await student("Family");
    const group = await prisma.familyPlanGroup.create({ data: { payerId: stu.id } });
    const plan = await runningPlan(stu.id, { familyGroupId: group.id, installmentAmountCents: 19799 });
    const res = await setAccountDiscount({ userId: stu.id, percent: 20, actor: actor() });
    expect(res.planChange).toBeNull();
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).installmentAmountCents).toBe(19799);
    await prisma.paymentPlan.delete({ where: { id: plan.id } });
    await prisma.familyPlanGroup.delete({ where: { id: group.id } });

    await expect(setAccountDiscount({ userId: admin.id, percent: 10, actor: actor() })).rejects.toBeInstanceOf(AccountDiscountError);
    await expect(setAccountDiscount({ userId: stu.id, percent: 0, actor: actor() })).rejects.toBeInstanceOf(AccountDiscountError);
    await expect(setAccountDiscount({ userId: stu.id, percent: 95, actor: actor() })).rejects.toBeInstanceOf(AccountDiscountError);
    await expect(setAccountDiscount({ userId: stu.id, percent: 12.5, actor: actor() })).rejects.toBeInstanceOf(AccountDiscountError);
    await expect(setAccountDiscount({ userId: "nobody", percent: 10, actor: actor() })).rejects.toBeInstanceOf(AccountDiscountError);
  });

  it("prices a NEW plan, and a term change, with the discount, keeping the price before it", async () => {
    const stu = await student("Newbie");
    await setAccountDiscount({ userId: stu.id, percent: 20, actor: actor() });
    const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 3, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} slot` } });
    slotIds.push(slot.id);

    const created = await createPaymentPlan(stu.id, OFFERED_PLAN_CADENCE, "MONTHLY", "pay@example.com", slot.id, 0);
    const list = calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, "MONTHLY").installmentAmountCents;
    expect(created.installmentAmountCents).toBe(discountedPlanPriceCents(list, 20));
    expect(created.listAmountCents).toBe(list);
    expect(created.installmentPayments[0].amountCents).toBe(created.installmentAmountCents);

    // The first bill is paid, then they move to a 3-month term: the new term's price with the same discount.
    await prisma.zellePayment.updateMany({ where: { paymentPlanId: created.id }, data: { status: "VERIFIED" } });
    await prisma.paymentPlan.update({ where: { id: created.id }, data: { installmentsPaid: 1 } });
    await changePaymentPlanTerm(stu.id, "TERM_3");
    const moved = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: created.id } });
    const list3 = calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, "TERM_3").installmentAmountCents;
    expect(moved).toMatchObject({ term: "TERM_3", installmentAmountCents: discountedPlanPriceCents(list3, 20), listAmountCents: list3 });
  });

  it("lists every account that has one, with the price it now pays", async () => {
    const rows = await listAccountDiscounts();
    const mine = rows.filter((r) => userIds.includes(r.userId));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => r.percent >= 1)).toBe(true);
  });
});
