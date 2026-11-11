import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPersonalDiscount } from "@/lib/accountDiscounts";
import { addBillingCycles } from "@/lib/billingCycle";
import { creditsLabelFromStored, CREDITS_PER_CLASS, MAX_SCHOLARSHIP_PERCENT, SCHOLARSHIP_TERM } from "@/lib/classCreditPricing";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { mayContinueOnScholarship, partialScholarship, scholarshipRenewedNotice, SCHOLARSHIP_RENEWAL_CYCLES, type PartialScholarship } from "@/lib/scholarshipWording";

/**
 * Plans on a scholarship: the database side of the owner's rule (wording is in scholarshipWording.ts).
 *
 * FULL (100%): the plan costs $0, so every 28-day bill settles by itself (freeBills.ts) and the student is never asked for anything.
 * A 6 Month plan has six bills; when the last one settles and the scholarship is still 100%, the SAME plan goes on for another six
 * (`termMonths` grows by 6, it stays ACTIVE and its next cycle starts where the last one ended), so access, the weekly time, the
 * weekly classes and the credits continue with no gap and nothing to do. See `planContinuesOnScholarship`.
 *
 * PARTIAL (1 to 99%): an ordinary bill for what is left, and the notice says so (`describeBillScholarship`).
 */

type Db = Prisma.TransactionClient | typeof prisma;

type PlanFacts = { userId: string; term: string; installmentAmountCents: number; familyGroupId: string | null };

/**
 * Whether a plan whose last bill is settling right now goes on by itself. Read inside the approval's transaction, so the answer and
 * the plan's new length commit together. False when the scholarship was ended or is under 100%, the plan is in a group, it has a
 * price, or the account is banned, locked for non-payment or an admin.
 */
export async function planContinuesOnScholarship(db: Db, plan: PlanFacts): Promise<boolean> {
  if (plan.term !== SCHOLARSHIP_TERM || plan.installmentAmountCents !== 0 || plan.familyGroupId) return false;
  const [user, discount] = await Promise.all([
    db.user.findUnique({ where: { id: plan.userId }, select: { role: true, bannedAt: true, paymentLockedAt: true } }),
    getPersonalDiscount(plan.userId, db),
  ]);
  if (!user) return false;
  return mayContinueOnScholarship({
    term: plan.term,
    priceCents: plan.installmentAmountCents,
    inGroup: Boolean(plan.familyGroupId),
    scholarshipPercent: discount.scholarshipPercent,
    banned: Boolean(user.bannedAt),
    paymentLocked: Boolean(user.paymentLockedAt),
    isAdmin: user.role === "ADMIN",
  });
}

/** What a partial scholarship did to one bill of this plan, or null (no scholarship pricing it, a group plan, a full scholarship). */
export async function describeBillScholarship(plan: { userId: string; term: string; listAmountCents: number | null; familyGroupId: string | null }, billCents: number): Promise<PartialScholarship | null> {
  if (plan.familyGroupId) return null;
  const discount = await getPersonalDiscount(plan.userId);
  return partialScholarship({ term: plan.term, listCents: plan.listAmountCents, billCents, scholarshipPercent: discount.scholarshipPercent, generalPercent: discount.percent });
}

/**
 * After a fully covered plan went on for another six cycles: one line in the activity log and one calm notice to the student (their
 * payments switch decides the email; the studio's Notify switch and a ban are respected by createNotification). Never throws.
 */
export async function afterScholarshipRenewal(planId: string, opts: { notify?: boolean; via: "last bill" | "daily check" }): Promise<void> {
  try {
    const plan = await prisma.paymentPlan.findUnique({ where: { id: planId }, select: { id: true, userId: true, installmentsPaid: true, termMonths: true, creditsPerInstallment: true, nextDueDate: true, user: { select: { email: true } } } });
    if (!plan) return;
    await logAudit({
      action: "plan.scholarship-renew",
      targetType: "PaymentPlan",
      targetId: plan.id,
      detail: `Full scholarship: the 6 Month plan of ${plan.user.email} went on for another ${SCHOLARSHIP_RENEWAL_CYCLES} cycles (${plan.installmentsPaid} of ${plan.termMonths} done), found at the ${opts.via}`,
    }).catch(() => undefined);
    if (opts.notify === false) return;
    const { describeReservedSlot } = await import("@/lib/paymentPlans");
    const slot = await describeReservedSlot(plan.id).catch(() => null);
    const creditsNote = `${creditsLabelFromStored(plan.creditsPerInstallment)} ${plan.creditsPerInstallment === CREDITS_PER_CLASS ? "is" : "are"} on your account for the next 28 days`;
    const notice = scholarshipRenewedNotice({ slot, creditsNote });
    await createNotification({ userId: plan.userId, type: "PAYMENT_PLAN_UPDATED", title: notice.title, body: notice.body, emailCategory: "payments", cta: { label: "See your classes", path: "/lessons" } });
  } catch (err) {
    console.error(`Scholarship renewal follow-up failed for plan ${planId} (non-blocking):`, err);
  }
}

/**
 * Every open plan bill that asks for $0 on a running plan is settled, whatever left it open (a scholarship raised to 100% while a
 * bill was open, a missed step). Also brings an unsent bill of a plan that now costs $0 down to $0 first. A bill already sent in for
 * review with real money is never touched. The daily job runs this first, so a covered student is never sent a bill notice.
 */
export async function settleCoveredBills(): Promise<number> {
  const { settleFreeBill } = await import("@/lib/freeBills");
  await prisma.zellePayment.updateMany({
    where: { purpose: "PAYMENT_PLAN_INSTALLMENT", status: "AWAITING_TRANSFER", submittedAt: null, bundleId: null, amountCents: { gt: 0 }, paymentPlan: { status: "ACTIVE", installmentAmountCents: 0, familyGroupId: null } },
    data: { amountCents: 0 },
  });
  const open = await prisma.zellePayment.findMany({
    where: { purpose: "PAYMENT_PLAN_INSTALLMENT", status: "AWAITING_TRANSFER", amountCents: 0, paymentPlan: { status: "ACTIVE" } },
    select: { id: true },
  });
  let settled = 0;
  for (const bill of open) if (await settleFreeBill(bill.id).catch(() => false)) settled++;
  return settled;
}

/** The same for one plan: used wherever a plan might be judged late, so a covered plan is settled instead. */
export async function settleCoveredPlanBills(planId: string): Promise<number> {
  const { settleFreeBill } = await import("@/lib/freeBills");
  await prisma.zellePayment.updateMany({
    where: { paymentPlanId: planId, purpose: "PAYMENT_PLAN_INSTALLMENT", status: "AWAITING_TRANSFER", submittedAt: null, bundleId: null, amountCents: { gt: 0 }, paymentPlan: { status: "ACTIVE", installmentAmountCents: 0, familyGroupId: null } },
    data: { amountCents: 0 },
  });
  const open = await prisma.zellePayment.findMany({ where: { paymentPlanId: planId, purpose: "PAYMENT_PLAN_INSTALLMENT", status: "AWAITING_TRANSFER", amountCents: 0, paymentPlan: { status: "ACTIVE" } }, select: { id: true } });
  let settled = 0;
  for (const bill of open) if (await settleFreeBill(bill.id).catch(() => false)) settled++;
  return settled;
}

/**
 * The safety net for the renewal, run by the daily job: a COMPLETED solo 6 Month plan whose paid 28 days are about to end (within
 * `leadDays`, and not over yet) and whose holder has a 100% scholarship right now goes on, exactly as it would have when its last
 * bill settled. This catches a plan that finished before the scholarship was raised to 100%, or before this rule existed. The plan
 * is reopened with one conditional update (only while it is still COMPLETED on the same date), so two runs renew once. The first
 * covered cycle is then settled quietly, so the student gets the one "continues" notice and nothing else.
 */
export async function renewCompletedScholarshipPlans(zelleHandle: string, now: Date = new Date(), leadDays = 7): Promise<number> {
  // A COMPLETED plan's nextDueDate is the START of its last paid cycle, which ends 28 days later.
  const endsAfter = addBillingCycles(now, -1);
  const endsBefore = addBillingCycles(new Date(now.getTime() + leadDays * 86_400_000), -1);
  const plans = await prisma.paymentPlan.findMany({
    where: {
      status: "COMPLETED",
      term: SCHOLARSHIP_TERM,
      familyGroupId: null,
      nextDueDate: { gt: endsAfter, lte: endsBefore },
      user: { bannedAt: null, paymentLockedAt: null, role: { not: "ADMIN" }, scholarshipsClaimed: { some: { claimedAt: { not: null }, revokedAt: null, percent: { gte: MAX_SCHOLARSHIP_PERCENT } } } },
    },
    select: { id: true, userId: true, term: true, nextDueDate: true, installmentsPaid: true, installmentAmountCents: true, listAmountCents: true, familyGroupId: true },
  });
  let renewed = 0;
  for (const plan of plans) {
    try {
      // Someone who already started another plan keeps that one; the finished plan stays finished.
      if (await prisma.paymentPlan.findFirst({ where: { userId: plan.userId, status: "ACTIVE" }, select: { id: true } })) continue;
      if (!(await planContinuesOnScholarship(prisma, { ...plan, installmentAmountCents: 0 }))) continue;
      const done = await prisma.paymentPlan.updateMany({
        where: { id: plan.id, status: "COMPLETED", nextDueDate: plan.nextDueDate, installmentsPaid: plan.installmentsPaid },
        data: {
          status: "ACTIVE",
          termMonths: plan.installmentsPaid + SCHOLARSHIP_RENEWAL_CYCLES,
          nextDueDate: addBillingCycles(plan.nextDueDate, 1),
          installmentAmountCents: 0,
          // The price before the scholarship is kept, so ending the scholarship later puts the plan back to it.
          listAmountCents: plan.listAmountCents ?? (plan.installmentAmountCents > 0 ? plan.installmentAmountCents : null),
        },
      });
      if (done.count !== 1) continue;
      renewed++;
      const { getOrCreateOpenInstallmentPayment } = await import("@/lib/paymentPlans");
      await getOrCreateOpenInstallmentPayment(plan.id, zelleHandle, now, { quietFree: true }).catch((err) => console.error(`Covered bill after renewal failed for plan ${plan.id} (the daily job settles it):`, err));
      await afterScholarshipRenewal(plan.id, { via: "daily check" });
    } catch (err) {
      console.error(`Scholarship renewal failed for plan ${plan.id} (non-blocking):`, err);
    }
  }
  return renewed;
}
