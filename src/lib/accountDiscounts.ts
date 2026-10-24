import { prisma } from "@/lib/prisma";
import { discountedPlanPriceCents, MAX_PERSONAL_DISCOUNT_PERCENT } from "@/lib/classCreditPricing";
import { noticePlanUpdated } from "@/lib/studentNotices";
import { logAudit } from "@/lib/audit";

/**
 * A percentage off ONE account's plan, chosen by the owner (Admin > Pricing). One row per account. It prices every solo plan that account
 * starts or changes from now on, AND moves the running solo plan: the plan's own price is the one thing bills read, so setting, changing
 * or removing a discount rewrites it (the price before the discount is kept in `listAmountCents`, so removing it restores exactly what
 * they signed up at). A bill already paid never changes; an unpaid, not yet submitted bill is rewritten so they pay the new price.
 * Family plans keep the family rate and are left alone.
 */

export class AccountDiscountError extends Error {}

/** This account's personal percent off, 0 when it has none. */
export async function getDiscountPercent(userId: string): Promise<number> {
  const row = await prisma.accountDiscount.findUnique({ where: { userId }, select: { percent: true } });
  return row?.percent ?? 0;
}

export interface PlanPriceChange {
  planId: string;
  fromCents: number;
  toCents: number;
  /** A bill that was open and unpaid was rewritten to the new price. */
  openBillChanged: boolean;
}

/** Rewrites the account's running solo plan (and its unpaid open bill) to the price a given percent gives. Runs inside the caller's transaction. */
export async function applyToRunningPlan(
  tx: Pick<typeof prisma, "paymentPlan" | "zellePayment">,
  userId: string,
  percent: number,
): Promise<PlanPriceChange | null> {
  const plan = await tx.paymentPlan.findFirst({ where: { userId, status: "ACTIVE", familyGroupId: null }, orderBy: { createdAt: "desc" } });
  if (!plan) return null;
  const list = plan.listAmountCents ?? plan.installmentAmountCents;
  const next = percent > 0 ? discountedPlanPriceCents(list, percent) : list;
  if (next === plan.installmentAmountCents && (percent > 0 ? plan.listAmountCents === list : plan.listAmountCents === null)) return null;

  await tx.paymentPlan.update({ where: { id: plan.id }, data: { installmentAmountCents: next, listAmountCents: percent > 0 ? list : null } });
  // A bill still waiting for the student (nothing sent yet) moves to the new price; one already submitted for review is left alone.
  const open = await tx.zellePayment.updateMany({
    where: { paymentPlanId: plan.id, purpose: "PAYMENT_PLAN_INSTALLMENT", status: "AWAITING_TRANSFER", submittedAt: null },
    data: { amountCents: next },
  });
  return { planId: plan.id, fromCents: plan.installmentAmountCents, toCents: next, openBillChanged: open.count > 0 };
}

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export interface SetDiscountResult {
  percent: number;
  planChange: PlanPriceChange | null;
}

/** Gives an account a percent off (or changes it). 1 to 90. */
export async function setAccountDiscount(input: { userId: string; percent: number; note?: string | null; actor: { id: string; email: string | null } }): Promise<SetDiscountResult> {
  const percent = input.percent;
  if (!Number.isInteger(percent) || percent < 1 || percent > MAX_PERSONAL_DISCOUNT_PERCENT) {
    throw new AccountDiscountError(`Enter a whole number from 1 to ${MAX_PERSONAL_DISCOUNT_PERCENT}. For a free account use complimentary access instead.`);
  }
  const note = input.note?.trim().slice(0, 200) || null;
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, role: true, name: true, email: true } });
  if (!user) throw new AccountDiscountError("That account does not exist.");
  if (user.role === "ADMIN") throw new AccountDiscountError("An admin does not pay for a plan.");

  const planChange = await prisma.$transaction(async (tx) => {
    await tx.accountDiscount.upsert({
      where: { userId: user.id },
      update: { percent, note, createdById: input.actor.id, expiresAt: null },
      create: { userId: user.id, percent, note, createdById: input.actor.id },
    });
    return applyToRunningPlan(tx, user.id, percent);
  });

  await logAudit({
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    action: "pricing.discount.set",
    targetType: "User",
    targetId: user.id,
    detail: `${percent}% off for ${user.name ?? user.email}${planChange ? `, monthly ${money(planChange.fromCents)} to ${money(planChange.toCents)}` : ""}${note ? `. ${note}` : ""}`,
  });
  if (planChange && planChange.fromCents !== planChange.toCents) {
    await noticePlanUpdated({
      userId: user.id,
      title: "Your plan price changed",
      body: `Your price per payment is now ${money(planChange.toCents)} (it was ${money(planChange.fromCents)}). It applies to your next bill${planChange.openBillChanged ? ", and the bill that is open now has been updated" : ""}.`,
    });
  }
  return { percent, planChange };
}

/** Takes an account's personal discount away; its running plan goes back to the price it signed up at. */
export async function clearAccountDiscount(input: { userId: string; actor: { id: string; email: string | null } }): Promise<SetDiscountResult> {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, name: true, email: true } });
  if (!user) throw new AccountDiscountError("That account does not exist.");
  const planChange = await prisma.$transaction(async (tx) => {
    await tx.accountDiscount.deleteMany({ where: { userId: user.id } });
    return applyToRunningPlan(tx, user.id, 0);
  });
  await logAudit({
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    action: "pricing.discount.clear",
    targetType: "User",
    targetId: user.id,
    detail: `Discount removed for ${user.name ?? user.email}${planChange ? `, monthly ${money(planChange.fromCents)} to ${money(planChange.toCents)}` : ""}`,
  });
  if (planChange && planChange.fromCents !== planChange.toCents) {
    await noticePlanUpdated({
      userId: user.id,
      title: "Your plan price changed",
      body: `Your price per payment is now ${money(planChange.toCents)} (it was ${money(planChange.fromCents)}). It applies to your next bill${planChange.openBillChanged ? ", and the bill that is open now has been updated" : ""}.`,
    });
  }
  return { percent: 0, planChange };
}

export interface DiscountRow {
  userId: string;
  name: string | null;
  email: string;
  percent: number;
  note: string | null;
  updatedAt: Date;
  /** Their running solo plan, if any: what it costs now and what it would cost with no discount. */
  plan: { monthlyCents: number; listCents: number; label: { cadence: string; term: string } } | null;
}

/** Every account with a discount, newest change first. */
export async function listAccountDiscounts(): Promise<DiscountRow[]> {
  const rows = await prisma.accountDiscount.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { name: true, email: true, paymentPlans: { where: { status: "ACTIVE", familyGroupId: null }, orderBy: { createdAt: "desc" }, take: 1 } } },
    },
  });
  return rows.map((r) => {
    const plan = r.user.paymentPlans[0];
    return {
      userId: r.userId,
      name: r.user.name,
      email: r.user.email,
      percent: r.percent,
      note: r.note,
      updatedAt: r.updatedAt,
      plan: plan ? { monthlyCents: plan.installmentAmountCents, listCents: plan.listAmountCents ?? plan.installmentAmountCents, label: { cadence: plan.cadence, term: plan.term } } : null,
    };
  });
}
