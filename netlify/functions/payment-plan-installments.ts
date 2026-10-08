import type { PaymentPlan, ZellePayment } from "@prisma/client";
import { schedule } from "@netlify/functions";
import { runJob } from "../../src/lib/jobRun";
import { prisma } from "../../src/lib/prisma";
import { createNotification } from "../../src/lib/notifications";
import { sendPaymentPlanInvoiceEmail, getAppUrl } from "../../src/lib/email";
import {
  getOrCreateOpenInstallmentPayment,
  addCalendarMonthsClamped,
  lapsePlanForNonPayment,
} from "../../src/lib/paymentPlans";
import { getNumberSetting } from "../../src/lib/siteSettings";
import { describePaymentPlan } from "../../src/lib/classCreditPricing";

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
  const planLabel = describePaymentPlan(plan.cadence, plan.term);
  const installmentLabel = `Installment ${payment.installmentNumber ?? plan.installmentsPaid + 1} of ${plan.termMonths}`;
  const isOverdue = type === "PAYMENT_PLAN_INSTALLMENT_OVERDUE";

  await createNotification({
    userId: plan.userId,
    type,
    title: isOverdue ? "Installment overdue" : "Installment due",
    body: isOverdue
      ? `${installmentLabel} on your ${planLabel} is ${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue. Your classes are on hold and your plan is canceled in ${lapseAfterDays - (overdueDays ?? 0)} day${lapseAfterDays - (overdueDays ?? 0) === 1 ? "" : "s"} unless you pay.`
      : `${installmentLabel} on your ${planLabel} is ready to pay.`,
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
    cycleEndsAt: addCalendarMonthsClamped(plan.nextDueDate, 1),
    zelleHandle: payment.zelleHandle,
    cta: { label: "Pay your installment", url: getAppUrl("/billing/plans") },
    overdueDays,
  }).catch((err) => console.error(`Installment invoice email failed for user ${plan.userId} (non-blocking):`, err));
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
export const handler = schedule("0 16 * * *", async () =>
  runJob("payment-plan-installments", async () => {
  const now = new Date();
  const leadDays = await getNumberSetting("payments.installmentLeadDays");
  const lapseAfterDays = await getNumberSetting("payments.lapseAfterDays");
  const overdueTriggerDays = Array.from({ length: lapseAfterDays - 1 }, (_, i) => i + 1);
  const leadWindowEnd = new Date(now.getTime() + leadDays * 24 * 60 * 60 * 1000);
  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

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
    await notifyInstallment(plan, payment, "PAYMENT_PLAN_INSTALLMENT_DUE");
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
  for (const payment of overduePayments) {
    // paymentPlan is guaranteed non-null here: the where clause above only
    // matches rows whose related plan is ACTIVE, and every
    // PAYMENT_PLAN_INSTALLMENT row is created with a paymentPlanId set
    // (see createPaymentPlan/getOrCreateOpenInstallmentPayment), the schema
    // allows null only for a hypothetical future purpose that isn't this one.
    const plan = payment.paymentPlan!;
    const gap = daysSince(plan.nextDueDate, now);
    if (!overdueTriggerDays.includes(gap)) continue;
    await notifyInstallment(plan, payment, "PAYMENT_PLAN_INSTALLMENT_OVERDUE", gap, lapseAfterDays);
    escalated++;
  }

  // Past the cutoff with nothing in review: cancel the plan and tell the student.
  const lapseCutoff = new Date(now.getTime() - lapseAfterDays * 24 * 60 * 60 * 1000);
  const lapsing = await prisma.paymentPlan.findMany({ where: { status: "ACTIVE", nextDueDate: { lte: lapseCutoff } }, select: { id: true } });
  let lapsed = 0;
  for (const plan of lapsing) {
    if (await lapsePlanForNonPayment(plan.id).catch(() => false)) lapsed++;
  }

  console.log(
    `Payment plan installments: lapsed ${lapsed}, opened ${opened} of ${duePlans.length} due plans, escalated ${escalated} of ${overduePayments.length} overdue installments`,
  );
  return { statusCode: 200 };
}));
