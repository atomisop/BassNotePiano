import type { PaymentPlanTerm } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePaymentPlanRate, describePaymentPlan, discountedPlanPriceCents, isPlanTermOffered } from "@/lib/classCreditPricing";
import { getPricingConfig } from "@/lib/pricing";
import { getDiscountPercent } from "@/lib/accountDiscounts";
import { livePaymentPlanConditions } from "@/lib/classSchedule";
import { PaymentPlanError, bookReservedWindowForPlan } from "@/lib/paymentPlans";
import { applyPlanInstallment } from "@/lib/payments";
import { noticePlanUpdated } from "@/lib/studentNotices";
import { logAudit } from "@/lib/audit";

/**
 * The studio's plan fixes, for any one person's plan (a person on a group or parent plan included): change its length, set an exact
 * price per bill, give the next 28 days free, and restart a plan that was canceled. Each is audited and the student is told (unless the
 * Notify switch is off).
 */

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

async function runningPlan(planId: string) {
  const plan = await prisma.paymentPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.status !== "ACTIVE") throw new PaymentPlanError("Only a running plan can be changed.");
  return plan;
}

/** An unpaid bill is closed (the next one is made at the new amount); a payment already sent in has to be settled first. */
async function closeUnpaidBill(planId: string) {
  const inReview = await prisma.zellePayment.findFirst({ where: { paymentPlanId: planId, status: "PENDING_REVIEW" }, select: { id: true } });
  if (inReview) throw new PaymentPlanError("A payment for this plan is being reviewed. Settle it on Billing > Payments first.");
  await prisma.zellePayment.updateMany({ where: { paymentPlanId: planId, status: "AWAITING_TRANSFER" }, data: { status: "EXPIRED" } });
}

/** Changes the plan's length (number of 28-day bills). `newPrice` takes that length's own price; otherwise the price per bill stays. */
export async function setPlanLength(adminId: string, planId: string, term: PaymentPlanTerm, newPrice: boolean): Promise<string> {
  const plan = await runningPlan(planId);
  if (!isPlanTermOffered(term)) throw new PaymentPlanError("Pick 1 Month, 3 Months or 6 Months.");
  if (plan.term === term) throw new PaymentPlanError("The plan already has that length.");
  const rate = calculatePaymentPlanRate(plan.cadence, term, await getPricingConfig());
  if (plan.installmentsPaid >= rate.termMonths) throw new PaymentPlanError(`${plan.installmentsPaid} bills are already paid, so that length would be over. Pick a longer one.`);
  await closeUnpaidBill(plan.id);
  const discount = newPrice ? await getDiscountPercent(plan.userId) : 0;
  const price = newPrice ? discountedPlanPriceCents(rate.installmentAmountCents, discount) : plan.installmentAmountCents;
  await prisma.paymentPlan.update({
    where: { id: plan.id },
    data: { term, termMonths: rate.termMonths, installmentAmountCents: price, ...(newPrice ? { listAmountCents: discount > 0 ? rate.installmentAmountCents : null } : {}) },
  });
  const label = describePaymentPlan(plan.cadence, term);
  await logAudit({ actorId: adminId, action: "plan.length", targetType: "PaymentPlan", targetId: plan.id, detail: `Length ${describePaymentPlan(plan.cadence, plan.term)} to ${label}, ${usd(price)} a bill` }).catch(() => undefined);
  await noticePlanUpdated({ userId: plan.userId, title: "Your plan length changed", body: `Your plan is now ${label}, ${usd(price)} every 28 days. ${plan.installmentsPaid} of ${rate.termMonths} bills are paid.` });
  return `${label}, ${usd(price)} a bill`;
}

/** Sets the exact price of each future bill. Not with a personal discount on the account (that tool owns the price then). */
export async function setPlanPrice(adminId: string, planId: string, cents: number): Promise<string> {
  const plan = await runningPlan(planId);
  if (!Number.isInteger(cents) || cents < 100 || cents > 100_000) throw new PaymentPlanError("Pick a price from $1 to $1,000.");
  if (cents === plan.installmentAmountCents) throw new PaymentPlanError("That is already the price.");
  if ((await getDiscountPercent(plan.userId)) > 0) throw new PaymentPlanError("This account has a personal discount. Remove it on Billing > Pricing first, then set the price.");
  await closeUnpaidBill(plan.id);
  await prisma.paymentPlan.update({ where: { id: plan.id }, data: { installmentAmountCents: cents, listAmountCents: null } });
  await logAudit({ actorId: adminId, action: "plan.price", targetType: "PaymentPlan", targetId: plan.id, detail: `Price per bill ${usd(plan.installmentAmountCents)} to ${usd(cents)}` }).catch(() => undefined);
  await noticePlanUpdated({ userId: plan.userId, title: "Your plan price changed", body: `From your next bill, your plan is ${usd(cents)} every 28 days.` });
  return usd(cents);
}

/**
 * Gives the next 28 days free: it counts as a bill of the plan (recorded as a $0 payment "Waived by the studio"), adds that cycle's
 * classes and credits, and moves the next bill 28 days out, exactly as if it had been paid.
 */
export async function waiveNextBill(adminId: string, planId: string): Promise<Date | null> {
  const plan = await runningPlan(planId);
  if (plan.installmentsPaid < 1) throw new PaymentPlanError("The first payment has not been made yet. Use Record payment for that one.");
  await closeUnpaidBill(plan.id);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.paymentPlan.updateMany({ where: { id: plan.id, status: "ACTIVE", installmentsPaid: plan.installmentsPaid }, data: { updatedAt: now } });
    if (claimed.count !== 1) throw new PaymentPlanError("This plan just changed. Refresh and try again.");
    await tx.zellePayment.create({
      data: { userId: plan.userId, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: plan.installmentsPaid + 1, amountCents: 0, lessonQuantity: plan.creditsPerInstallment, zelleHandle: "Waived by the studio", status: "VERIFIED", submittedAt: now, reviewedAt: now, reviewedById: adminId, checkedAt: now },
    });
    await applyPlanInstallment(tx, { userId: plan.userId, paymentPlanId: plan.id, lessonQuantity: plan.creditsPerInstallment });
  });
  await bookReservedWindowForPlan(plan.id);
  const after = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
  const next = after.status === "ACTIVE" ? after.nextDueDate : null;
  await logAudit({ actorId: adminId, action: "plan.waive", targetType: "PaymentPlan", targetId: plan.id, detail: `Waived bill ${plan.installmentsPaid + 1} (${usd(plan.installmentAmountCents)})` }).catch(() => undefined);
  await noticePlanUpdated({ userId: plan.userId, title: "Your next 28 days are on us", body: next ? `The studio covered your next bill. Your classes are booked, and your next payment is due ${day(next)}.` : "The studio covered your last bill. Your classes are booked and your plan is complete." });
  return next;
}

/**
 * Brings back a canceled plan: it runs again with the bills already paid. Its weekly time comes back when it is still free (otherwise
 * pick a new one with Weekly time). The next bill is the date it had, or today when that has passed.
 */
export async function restartPlan(adminId: string, planId: string): Promise<{ keptTime: boolean; nextDue: Date }> {
  const plan = await prisma.paymentPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.status !== "CANCELED") throw new PaymentPlanError("Only a canceled plan can be restarted.");
  if (plan.installmentsPaid >= plan.termMonths) throw new PaymentPlanError("Every bill of this plan was already paid. Start a new plan with the plan builder instead.");
  const other = await prisma.paymentPlan.findFirst({ where: { userId: plan.userId, status: "ACTIVE" }, select: { id: true } });
  if (other) throw new PaymentPlanError("This student already has a running plan. Cancel it first.");
  const user = await prisma.user.findUnique({ where: { id: plan.userId }, select: { bannedAt: true } });
  if (user?.bannedAt) throw new PaymentPlanError("This account is banned. Lift the ban first.");

  const now = new Date();
  const nextDue = plan.nextDueDate > now ? plan.nextDueDate : now;
  let keptTime = false;
  await prisma.$transaction(
    async (tx) => {
      if (plan.reservedScheduleId && plan.reservedChunkIndex !== null) {
        const holder = await tx.paymentPlan.findFirst({ where: { id: { not: plan.id }, reservedScheduleId: plan.reservedScheduleId, reservedChunkIndex: plan.reservedChunkIndex, OR: livePaymentPlanConditions() }, select: { id: true } });
        keptTime = !holder;
      }
      const claimed = await tx.paymentPlan.updateMany({
        where: { id: plan.id, status: "CANCELED" },
        data: { status: "ACTIVE", canceledAt: null, canceledById: null, cancellationNote: null, cancellationReason: null, cancellationReasonNote: null, nextDueDate: nextDue, pausedAt: null, pauseUntil: null, ...(keptTime ? {} : { reservedScheduleId: null, reservedChunkIndex: null }) },
      });
      if (claimed.count !== 1) throw new PaymentPlanError("This plan just changed. Refresh and try again.");
    },
    { isolationLevel: "Serializable" },
  );
  if (keptTime) await bookReservedWindowForPlan(plan.id);
  await logAudit({ actorId: adminId, action: "plan.restart", targetType: "PaymentPlan", targetId: plan.id, detail: `Restarted the plan, next bill ${day(nextDue)}${keptTime ? "" : ", its weekly time was taken"}` }).catch(() => undefined);
  await noticePlanUpdated({ userId: plan.userId, title: "Your plan is back on", body: `The studio restarted your ${describePaymentPlan(plan.cadence, plan.term)} plan. Your next payment is due ${day(nextDue)}.` });
  return { keptTime, nextDue };
}
