import { prisma } from "@/lib/prisma";
import { cancelOpenBill, undoRefundZellePayment } from "@/lib/payments";
import { setPlanProgress } from "@/lib/adminPlanTools";

/**
 * The owner's Money check: looks over every running plan and open bill and lists what does not add up, in plain words, each with one
 * button that fixes it. Nothing here changes by itself; a fix is applied only when the owner presses it, and is checked again first,
 * so a stale page can never apply an old answer.
 *
 * What it looks for:
 *  - a plan whose "bills paid" does not match its real paid bills (a refunded or deleted bill still counted, or a paid bill not counted)
 *  - an open bill that is no longer owed (its month is already paid, or its plan ended)
 *  - a group's combined first payment still open although every member is already paid
 */
export type MoneyFixId = "setPaid" | "closeBill" | "undoRefund";

export interface MoneyIssue {
  key: string;
  title: string;
  /** Plain words: what is wrong and why it matters. */
  detail: string;
  person: string;
  personId: string;
  fixes: { id: MoneyFixId; label: string; hint: string }[];
}

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export async function findMoneyIssues(): Promise<MoneyIssue[]> {
  const issues: MoneyIssue[] = [];
  const plans = await prisma.paymentPlan.findMany({
    where: { status: { in: ["ACTIVE", "COMPLETED"] } },
    select: {
      id: true, userId: true, status: true, installmentsPaid: true, termMonths: true, familyGroupId: true,
      user: { select: { name: true, email: true } },
      installmentPayments: { where: { purpose: "PAYMENT_PLAN_INSTALLMENT" }, select: { id: true, status: true, installmentNumber: true, amountCents: true }, orderBy: { installmentNumber: "asc" } },
    },
  });
  const startPaid = new Set(
    (await prisma.zellePayment.findMany({ where: { purpose: "FAMILY_PLAN_START", status: "VERIFIED", familyGroupId: { not: null } }, select: { familyGroupId: true } })).map((p) => p.familyGroupId!),
  );

  for (const plan of plans) {
    const name = plan.user.name ?? plan.user.email;
    const verified = plan.installmentPayments.filter((p) => p.status === "VERIFIED");
    const expected = verified.length + (plan.familyGroupId && startPaid.has(plan.familyGroupId) ? 1 : 0);
    if (plan.installmentsPaid !== expected) {
      const refunded = [...plan.installmentPayments].reverse().find((p) => p.status === "REFUNDED");
      const fixes: MoneyIssue["fixes"] = [{ id: "setPaid", label: `Set to ${expected} of ${plan.termMonths}`, hint: "Matches the plan to the bills that were really paid. Credits and classes are not changed." }];
      if (refunded && plan.installmentsPaid > expected) fixes.push({ id: "undoRefund", label: `Undo the ${usd(refunded.amountCents)} refund`, hint: "Counts that bill as paid again, so the plan is right as it is." });
      issues.push({
        key: `counter:${plan.id}`,
        title: "Bills paid does not match",
        detail: `${name}'s plan says ${plan.installmentsPaid} of ${plan.termMonths} bills are paid, but ${expected} ${expected === 1 ? "was" : "were"} really paid${refunded ? " (a refunded bill still counts on the plan)" : ""}.`,
        person: name,
        personId: plan.userId,
        fixes: fixes.filter((f, i) => (refunded && plan.installmentsPaid > expected ? true : i === 0)),
      });
    }
    for (const bill of plan.installmentPayments.filter((p) => p.status === "AWAITING_TRANSFER")) {
      if (bill.installmentNumber !== null && bill.installmentNumber <= plan.installmentsPaid) {
        issues.push({
          key: `stale:${bill.id}`,
          title: "An unpaid bill nobody owes",
          detail: `${name} has an open ${usd(bill.amountCents)} bill for payment ${bill.installmentNumber}, but the plan already counts ${plan.installmentsPaid} paid.`,
          person: name,
          personId: plan.userId,
          fixes: [{ id: "closeBill", label: "Close this bill", hint: "The record stays as expired. The plan is not changed." }],
        });
      }
    }
  }

  const starts = await prisma.zellePayment.findMany({
    where: { purpose: "FAMILY_PLAN_START", status: "AWAITING_TRANSFER", familyGroupId: { not: null } },
    select: { id: true, amountCents: true, familyGroupId: true, user: { select: { id: true, name: true, email: true } } },
  });
  for (const start of starts) {
    const members = await prisma.paymentPlan.findMany({ where: { familyGroupId: start.familyGroupId! }, select: { installmentsPaid: true } });
    if (members.length > 0 && members.every((m) => m.installmentsPaid > 0)) {
      issues.push({
        key: `start:${start.id}`,
        title: "A group's first payment is still open",
        detail: `${start.user.name ?? start.user.email}'s group already has every member paid, but the combined ${usd(start.amountCents)} first payment still shows as awaiting.`,
        person: start.user.name ?? start.user.email,
        personId: start.user.id,
        fixes: [{ id: "closeBill", label: "Close this bill", hint: "Nothing is owed on it any more. The record stays as expired." }],
      });
    }
  }
  return issues;
}

/** Applies one fix from the check. Looks the problem up again first and refuses if it no longer applies. */
export async function applyMoneyFix(admin: { id: string; email: string | null }, key: string, fix: MoneyFixId): Promise<string> {
  const issue = (await findMoneyIssues()).find((i) => i.key === key);
  if (!issue || !issue.fixes.some((f) => f.id === fix)) throw new Error("That no longer applies. Refresh the page.");
  const id = key.slice(key.indexOf(":") + 1);
  if (fix === "closeBill") {
    await cancelOpenBill(id, admin);
    return "Bill closed.";
  }
  if (fix === "setPaid") {
    const plan = await prisma.paymentPlan.findUniqueOrThrow({
      where: { id },
      select: { nextDueDate: true, installmentPayments: { where: { purpose: "PAYMENT_PLAN_INSTALLMENT", status: "VERIFIED" }, select: { id: true } }, familyGroupId: true },
    });
    const startPaid = plan.familyGroupId ? (await prisma.zellePayment.count({ where: { purpose: "FAMILY_PLAN_START", status: "VERIFIED", familyGroupId: plan.familyGroupId } })) > 0 : false;
    const billsPaid = plan.installmentPayments.length + (startPaid ? 1 : 0);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(plan.nextDueDate);
    await setPlanProgress(admin.id, id, { billsPaid, nextBillDay: day });
    return `Plan set to ${billsPaid} paid.`;
  }
  const refunded = await prisma.zellePayment.findFirst({ where: { paymentPlanId: id, purpose: "PAYMENT_PLAN_INSTALLMENT", status: "REFUNDED" }, orderBy: { installmentNumber: "desc" }, select: { id: true } });
  if (!refunded) throw new Error("There is no refunded bill to undo.");
  await undoRefundZellePayment(refunded.id, admin, { restoreCredits: false, reactivatePlan: false });
  return "Refund undone.";
}
