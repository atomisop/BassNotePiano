import type { PaymentPlan, ZellePayment } from "@prisma/client";
import { schedule } from "@netlify/functions";
import { runJob } from "../../src/lib/jobRun";
import { addBillingCycles } from "../../src/lib/billingCycle";
import { prisma } from "../../src/lib/prisma";
import { createNotification } from "../../src/lib/notifications";
import { sendPaymentPlanInvoiceEmail, getAppUrl } from "../../src/lib/email";
import {
  getOrCreateOpenInstallmentPayment,
  lapsePlanForNonPayment,
} from "../../src/lib/paymentPlans";
import { getNumberSetting } from "../../src/lib/siteSettings";
import { describePaymentPlan } from "../../src/lib/classCreditPricing";
import { groupBillPath } from "../../src/lib/inPlaceLinks";
import { describeBillScholarship, renewCompletedScholarshipPlans, settleCoveredBills } from "../../src/lib/scholarshipPlans";
import { installmentDueBody, installmentOverdueBody, scholarshipDueLine, scholarshipOverdueLine } from "../../src/lib/scholarshipWording";
import { settleFreeBill } from "../../src/lib/freeBills";

// A reminder every day once a payment is overdue, then the plan is canceled
// at LAPSE_AFTER_DAYS (see lapsePlanForNonPayment). The cap is the lapse
// itself: the daily email stops the day the plan is canceled, so it can never
// become an endless nag under the shared notifyEmailPayments toggle.

function daysSince(date: Date, now: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const a = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

async function notifyInstallment(
  plan: PaymentPlan,
  payment: ZellePayment,
  type: "PAYMENT_PLAN_INSTALLMENT_DUE" | "PAYMENT_PLAN_INSTALLMENT_OVERDUE",
  overdueDays?: number,
  lapseAfterDays = 7,
) {
  // A bill that asks for nothing (a full scholarship) is never announced: no bell, no email. It settles by itself.
  if (payment.amountCents <= 0) return;
  const planLabel = describePaymentPlan(plan.cadence, plan.term);
  const installmentLabel = `Installment ${payment.installmentNumber ?? plan.installmentsPaid + 1} of ${plan.termMonths}`;
  const isOverdue = type === "PAYMENT_PLAN_INSTALLMENT_OVERDUE";
  // A partial scholarship: the notice and the email say what it covered and what is left to pay.
  const scholarship = await describeBillScholarship(plan, payment.amountCents).catch(() => null);
  const daysLeft = lapseAfterDays - (overdueDays ?? 0);

  await createNotification({
    userId: plan.userId,
    type,
    title: isOverdue ? "Installment overdue" : "Installment due",
    body: isOverdue
      ? installmentOverdueBody({ installmentLabel, planLabel, overdueDays: overdueDays ?? 0, daysLeft, scholarship })
      : installmentDueBody({ installmentLabel, planLabel, scholarship }),
    // No emailCategory here on purpose, the email below is a dedicated
    // itemized invoice (sendPaymentPlanInvoiceEmail), not the generic
    // CTA-button template createNotification's emailCategory path sends.
  });

  const user = await prisma.user.findUnique({
    where: { id: plan.userId },
    select: { email: true, notifyEmailPayments: true },
  });
  if (!user?.notifyEmailPayments) return;

  await sendPaymentPlanInvoiceEmail(user.email, {
    planLabel,
    installmentLabel,
    amountCents: payment.amountCents,
    dueDate: plan.nextDueDate,
    // Same value approveZellePayment computes for this installment's own
    // CreditGrant.expiresAt at approval time, knowable ahead of approval
    // since only approval itself ever advances nextDueDate.
    cycleEndsAt: addBillingCycles(plan.nextDueDate, 1),
    zelleHandle: payment.zelleHandle,
    cta: { label: "Pay your installment", url: getAppUrl("/billing/plans") },
    overdueDays,
    scholarshipNote: scholarship ? (isOverdue ? scholarshipOverdueLine(scholarship) : scholarshipDueLine(scholarship)) : undefined,
    unsubscribe: { userId: plan.userId, category: "payments" },
  }).catch((err) => console.error(`Installment invoice email failed for user ${plan.userId} (non-blocking):`, err));
}


const usdLabel = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * A group's bill (the one combined bill, or one member's own bill while the group has fewer than two open): the payer is told it is
 * theirs to pay and everyone else in a family group hears the same thing at the same moment, with nothing for them to pay. In parent
 * mode only the parent is told. Nobody but the payer is ever sent a pay button.
 */
async function notifyGroupBill(plan: PaymentPlan, payment: ZellePayment, type: "PAYMENT_PLAN_INSTALLMENT_DUE" | "PAYMENT_PLAN_INSTALLMENT_OVERDUE", overdueDays?: number, lapseAfterDays = 7): Promise<void> {
  const group = await prisma.familyPlanGroup.findUnique({
    where: { id: plan.familyGroupId! },
    select: { kind: true, payerId: true, payer: { select: { name: true, email: true } }, plans: { where: { status: "ACTIVE" }, select: { userId: true } } },
  });
  if (!group) return;
  const isOverdue = type === "PAYMENT_PLAN_INSTALLMENT_OVERDUE";
  const people = group.plans.length;
  const amount = usdLabel(payment.amountCents);
  const payerName = group.payer.name ?? group.payer.email;
  await createNotification({
    userId: group.payerId,
    type,
    title: isOverdue ? "Group bill overdue" : "Group bill ready to pay",
    body: isOverdue
      ? `Your group's 28-day bill of ${amount} is ${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue. Classes are on hold and the plans are canceled in ${lapseAfterDays - (overdueDays ?? 0)} day${lapseAfterDays - (overdueDays ?? 0) === 1 ? "" : "s"} unless it is paid.`
      : `Your group's 28-day bill of ${amount}${people > 1 ? ` for ${people} people` : ""} is ready. One payment covers everyone, and you get one receipt.`,
    emailCategory: "payments",
    // Where this bill is paid, the same place the bill bar sends them: a parent pays on the Parent page.
    cta: { label: "Pay the bill", path: groupBillPath(group.kind) },
  }).catch((err) => console.error(`Group bill notice failed for payer ${group.payerId} (non-blocking):`, err));
  if (group.kind === "PARENT") return;
  for (const member of group.plans) {
    if (member.userId === group.payerId) continue;
    await createNotification({
      userId: member.userId,
      type,
      title: isOverdue ? "Your group's bill is overdue" : "Your group's bill is ready",
      body: `${payerName} pays the group's 28-day bill and has been told. There is nothing for you to pay.`,
      emailCategory: "payments",
    }).catch((err) => console.error(`Group bill notice failed for member ${member.userId} (non-blocking):`, err));
  }
}

async function isGroupMemberNotPayer(plan: PaymentPlan): Promise<boolean> {
  if (!plan.familyGroupId) return false;
  const group = await prisma.familyPlanGroup.findUnique({ where: { id: plan.familyGroupId }, select: { payerId: true } });
  return Boolean(group && group.payerId !== plan.userId);
}

// Runs once daily at 16:00 UTC (practice-reminders.ts already owns 15:00,
// staggered rather than coincidental). Two halves with different robustness
// needs:
//
//  (a) Upcoming, existence-based, not exact-day-match. Robust to a missed
//      run: if this doesn't fire for a few days (an outage, a bad deploy),
//      the next run still finds any ACTIVE plan whose nextDueDate has
//      entered the window and has no open installment yet, and creates +
//      notifies exactly once, just a bit later than ideal. A missed
//      financial reminder is a real problem, not a shrug, unlike a missed
//      practice nudge, this can't be a same-exact-day-only check.
//
//  (b) Overdue escalation, exact-day-match against nextDueDate, same idiom
//      REMINDER_TRIGGER_DAYS uses in practice-reminders.ts. Fine here
//      because the row from (a) already exists by the time this can ever
//      match; a missed escalation day just means one fewer nudge, not a
//      never-created invoice.
export const runPaymentPlanInstallments = () =>
  runJob("payment-plan-installments", async () => {
  const now = new Date();
  const leadDays = await getNumberSetting("payments.installmentLeadDays");
  const lapseAfterDays = await getNumberSetting("payments.lapseAfterDays");
  const overdueTriggerDays = Array.from({ length: lapseAfterDays - 1 }, (_, i) => i + 1);
  const leadWindowEnd = new Date(now.getTime() + leadDays * 24 * 60 * 60 * 1000);
  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  // Full scholarships first, so nothing below can ever treat a covered student as someone who owes: every open $0 bill is settled,
  // and a finished plan whose holder still has a 100% scholarship goes on for another six cycles (scholarshipPlans.ts).
  const coveredSettled = await settleCoveredBills().catch((err) => {
    console.error("Settling covered bills failed (non-blocking):", err);
    return 0;
  });
  const scholarshipRenewed = await renewCompletedScholarshipPlans(zelleHandle, now, leadDays).catch((err) => {
    console.error("Scholarship renewal check failed (non-blocking):", err);
    return 0;
  });

  const duePlans = await prisma.paymentPlan.findMany({
    where: { status: "ACTIVE", nextDueDate: { lte: leadWindowEnd } },
  });

  let opened = 0;
  for (const plan of duePlans) {
    const { payment, wasCreated } = await getOrCreateOpenInstallmentPayment(plan.id, zelleHandle, now);
    // !wasCreated covers both "already open from an earlier run" and "not
    // within INSTALLMENT_OPEN_LEAD_DAYS yet." The latter shouldn't actually
    // happen here since duePlans is already filtered to that same window,
    // but the null check is what the type (rather than that invariant) can
    // actually guarantee.
    if (!wasCreated || !payment) continue;
    // A group's bill: the payer is told (and the rest of a family group at the same moment), never a member with a pay button.
    if (payment.purpose === "FAMILY_PLAN_INSTALLMENT" || (await isGroupMemberNotPayer(plan))) {
      await notifyGroupBill(plan, payment, "PAYMENT_PLAN_INSTALLMENT_DUE");
    } else {
      await notifyInstallment(plan, payment, "PAYMENT_PLAN_INSTALLMENT_DUE");
    }
    opened++;
  }

  const overduePayments = await prisma.zellePayment.findMany({
    where: {
      purpose: "PAYMENT_PLAN_INSTALLMENT",
      status: "AWAITING_TRANSFER",
      paymentPlan: { status: "ACTIVE", nextDueDate: { lt: now } },
    },
    include: { paymentPlan: true },
  });

  let escalated = 0;
  const bundlesEscalated = new Set<string>();
  for (const payment of overduePayments) {
    // paymentPlan is guaranteed non-null here: the where clause above only
    // matches rows whose related plan is ACTIVE, and every
    // PAYMENT_PLAN_INSTALLMENT row is created with a paymentPlanId set
    // (see createPaymentPlan/getOrCreateOpenInstallmentPayment), the schema
    // allows null only for a hypothetical future purpose that isn't this one.
    const plan = payment.paymentPlan!;
    // A $0 bill is never overdue: it is settled here if anything left it open, and nobody is told anything about a bill.
    if (payment.amountCents === 0) {
      await settleFreeBill(payment.id).catch(() => false);
      continue;
    }
    const gap = daysSince(plan.nextDueDate, now);
    if (!overdueTriggerDays.includes(gap)) continue;
    if (payment.bundleId) {
      // Held in the group's combined bill: one overdue notice for the whole bill, not one per member.
      if (bundlesEscalated.has(payment.bundleId)) continue;
      bundlesEscalated.add(payment.bundleId);
      const bundle = await prisma.zellePayment.findUnique({ where: { id: payment.bundleId } });
      if (bundle && bundle.status === "AWAITING_TRANSFER") await notifyGroupBill(plan, bundle, "PAYMENT_PLAN_INSTALLMENT_OVERDUE", gap, lapseAfterDays);
    } else if (await isGroupMemberNotPayer(plan)) {
      await notifyGroupBill(plan, payment, "PAYMENT_PLAN_INSTALLMENT_OVERDUE", gap, lapseAfterDays);
    } else {
      await notifyInstallment(plan, payment, "PAYMENT_PLAN_INSTALLMENT_OVERDUE", gap, lapseAfterDays);
    }
    escalated++;
  }

  // Past the cutoff with nothing in review: cancel the plan and tell the student.
  const lapseCutoff = new Date(now.getTime() - lapseAfterDays * 24 * 60 * 60 * 1000);
  const lapsing = await prisma.paymentPlan.findMany({ where: { status: "ACTIVE", nextDueDate: { lte: lapseCutoff } }, select: { id: true } });
  let lapsed = 0;
  for (const plan of lapsing) {
    if (await lapsePlanForNonPayment(plan.id).catch(() => false)) lapsed++;
  }

  // A plan whose FIRST bill was never paid holds its weekly time for nobody: released much sooner than a late month.
  const firstBillDays = await getNumberSetting("payments.firstBillLapseDays");
  const unpaidNew = await prisma.paymentPlan.findMany({
    where: { status: "ACTIVE", installmentsPaid: 0, createdAt: { lte: new Date(now.getTime() - firstBillDays * 24 * 60 * 60 * 1000) } },
    select: { id: true },
  });
  for (const plan of unpaidNew) {
    if (await lapsePlanForNonPayment(plan.id, { firstBill: true }).catch(() => false)) lapsed++;
  }

  console.log(
    `Payment plan installments: settled ${coveredSettled} covered, renewed ${scholarshipRenewed} scholarship plans, lapsed ${lapsed}, opened ${opened} of ${duePlans.length} due plans, escalated ${escalated} of ${overduePayments.length} overdue installments`,
  );
  return { statusCode: 200 };
});

export const handler = schedule("0 16 * * *", async () => runPaymentPlanInstallments());
