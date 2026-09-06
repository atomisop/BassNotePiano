import type { PaymentPlan, ZellePayment } from "@prisma/client";
import { schedule } from "@netlify/functions";
import { prisma } from "../../src/lib/prisma";
import { createNotification } from "../../src/lib/notifications";
import { sendPaymentPlanInvoiceEmail, getAppUrl } from "../../src/lib/email";
import { getOrCreateOpenInstallmentPayment } from "../../src/lib/paymentPlans";
import { describePaymentPlan } from "../../src/lib/classCreditPricing";

// How far ahead of nextDueDate to open the next installment for payment and
// send the first "here's your invoice" notice.
const INSTALLMENT_REMINDER_LEAD_DAYS = 7;

// Escalating overdue reminders, then stop — capped, not infinite. This cap
// is a real design constraint, not a tunable detail: notifyEmailPayments is
// on by default and shared with plain payment confirmations, so an
// uncapped nag schedule under that same toggle would be a real complaint
// risk with no way to mute it without also muting real confirmations.
const OVERDUE_TRIGGER_DAYS = [3, 7, 14];

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
) {
  const planLabel = describePaymentPlan(plan.cadence, plan.term);
  const installmentLabel = `Installment ${payment.installmentNumber ?? plan.installmentsPaid + 1} of ${plan.termMonths}`;
  const isOverdue = type === "PAYMENT_PLAN_INSTALLMENT_OVERDUE";

  await createNotification({
    userId: plan.userId,
    type,
    title: isOverdue ? "Installment overdue" : "Installment due",
    body: isOverdue
      ? `${installmentLabel} on your ${planLabel} is ${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue.`
      : `${installmentLabel} on your ${planLabel} is ready to pay.`,
    // No emailCategory here on purpose — the email below is a dedicated
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
    zelleHandle: payment.zelleHandle,
    cta: { label: "Pay your installment", url: getAppUrl("/billing/plans") },
    overdueDays,
  }).catch((err) => console.error(`Installment invoice email failed for user ${plan.userId} (non-blocking):`, err));
}

// Runs once daily at 16:00 UTC (practice-reminders.ts already owns 15:00,
// staggered rather than coincidental). Two halves with different robustness
// needs:
//
//  (a) Upcoming — existence-based, not exact-day-match. Robust to a missed
//      run: if this doesn't fire for a few days (an outage, a bad deploy),
//      the next run still finds any ACTIVE plan whose nextDueDate has
//      entered the window and has no open installment yet, and creates +
//      notifies exactly once, just a bit later than ideal. A missed
//      financial reminder is a real problem, not a shrug — unlike a missed
//      practice nudge, this can't be a same-exact-day-only check.
//
//  (b) Overdue escalation — exact-day-match against nextDueDate, same idiom
//      REMINDER_TRIGGER_DAYS uses in practice-reminders.ts. Fine here
//      because the row from (a) already exists by the time this can ever
//      match; a missed escalation day just means one fewer nudge, not a
//      never-created invoice.
export const handler = schedule("0 16 * * *", async () => {
  const now = new Date();
  const leadWindowEnd = new Date(now.getTime() + INSTALLMENT_REMINDER_LEAD_DAYS * 24 * 60 * 60 * 1000);
  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  const duePlans = await prisma.paymentPlan.findMany({
    where: { status: "ACTIVE", nextDueDate: { lte: leadWindowEnd } },
  });

  let opened = 0;
  for (const plan of duePlans) {
    const { payment, wasCreated } = await getOrCreateOpenInstallmentPayment(plan.id, zelleHandle);
    if (!wasCreated) continue; // already open (and already notified) from an earlier run
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
    // (see createPaymentPlan/getOrCreateOpenInstallmentPayment) — the schema
    // allows null only for a hypothetical future purpose that isn't this one.
    const plan = payment.paymentPlan!;
    const gap = daysSince(plan.nextDueDate, now);
    if (!OVERDUE_TRIGGER_DAYS.includes(gap)) continue;
    await notifyInstallment(plan, payment, "PAYMENT_PLAN_INSTALLMENT_OVERDUE", gap);
    escalated++;
  }

  console.log(
    `Payment plan installments: opened ${opened} of ${duePlans.length} due plans, escalated ${escalated} of ${overduePayments.length} overdue installments`,
  );
  return { statusCode: 200 };
});
