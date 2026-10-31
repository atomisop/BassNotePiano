// What a payment receipt says. Pure, so the wording is tested without a database (tests/paymentReceiptRules.test.ts); the facts
// come from loadPaymentReceipt in paymentReceipt.ts, and the same Receipt draws the email (sendPaymentReceiptEmail) and the
// printable page (/billing/receipt/[paymentId]).

import type { PaymentMethod, PaymentPlanCadence, PaymentPlanTerm, PaymentPurpose } from "@prisma/client";
import { creditsLabelFromStored, describePaymentPlan } from "@/lib/classCreditPricing";
import { BILLING_CYCLE_DAYS } from "@/lib/billingCycle";

export interface ReceiptFacts {
  referenceCode: string;
  purpose: PaymentPurpose;
  method: PaymentMethod;
  amountCents: number;
  /** When the payment was confirmed (approved). */
  paidAt: Date;
  /** The account the receipt is for. */
  accountName: string;
  accountEmail: string;
  /** The name on the bank transfer, when the bank email gave one. */
  senderName: string | null;
  /** Credits added, stored in half-classes (classCreditPricing.ts). */
  creditsStored: number | null;
  plan: { cadence: PaymentPlanCadence; term: PaymentPlanTerm; termMonths: number; installmentNumber: number | null } | null;
  /** The 28 days the payment pays for, when it is a plan payment. */
  periodEnd: Date | null;
  /** The next bill, when the plan has one. */
  nextBill: { dueDate: Date; amountCents: number } | null;
  /** Group or parent plan start: how many people the one payment starts. */
  groupSize: number | null;
  /** An extra one-off class: when it is. */
  extraClassAt: Date | null;
}

export interface Receipt {
  number: string;
  title: string;
  amountLabel: string;
  paidOn: string;
  /** The single line item: what was bought. */
  item: string;
  rows: { label: string; value: string }[];
}

const TZ = "America/New_York";
export const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const longDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: TZ });
const shortDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });

/** The one line that names what was paid for. */
export function receiptItem(f: ReceiptFacts): string {
  switch (f.purpose) {
    case "PAYMENT_PLAN_INSTALLMENT":
      if (!f.plan) return "Payment plan";
      return `${describePaymentPlan(f.plan.cadence, f.plan.term)}, payment ${f.plan.installmentNumber ?? 1} of ${f.plan.termMonths}`;
    case "FAMILY_PLAN_START":
      return f.groupSize && f.groupSize > 1 ? `Group plan, first payment for ${f.groupSize} people` : "Group plan, first payment";
    case "CLASS_CREDITS":
      if (f.extraClassAt) return `Extra class on ${shortDate(f.extraClassAt)}`;
      return f.creditsStored ? `Extra classes: ${creditsLabelFromStored(f.creditsStored)}` : "Extra classes";
    case "CURRICULUM":
      return "Curriculum access";
    case "CURRICULUM_FAMILY_BUNDLE":
      return "Curriculum access, family bundle";
    case "FAMILY_BUNDLE":
      return "Family class bundle";
    case "SCALE_UNLOCK":
      return "Scale unlock";
  }
}

/** Banks write the sender's name in capitals ("ALEX DEMO"); a receipt shows it the way people write it. */
export function displayName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
}

export function buildReceipt(f: ReceiptFacts): Receipt {
  const rows: Receipt["rows"] = [
    { label: "Receipt number", value: f.referenceCode },
    { label: "Paid on", value: longDate(f.paidAt) },
    { label: "Paid by", value: f.senderName && f.senderName.trim() ? displayName(f.senderName) : f.accountName },
    { label: "Method", value: f.method === "VENMO" ? "Venmo" : "Zelle" },
    { label: "Account", value: f.accountEmail },
  ];
  if (f.periodEnd) {
    const start = new Date(f.periodEnd.getTime() - BILLING_CYCLE_DAYS * 86_400_000);
    rows.push({ label: "Covers", value: `${shortDate(start)} to ${shortDate(f.periodEnd)} (${BILLING_CYCLE_DAYS} days)` });
  }
  if (f.creditsStored && f.creditsStored > 0) rows.push({ label: "Classes added", value: creditsLabelFromStored(f.creditsStored) });
  if (f.nextBill) rows.push({ label: "Next bill", value: `${usd(f.nextBill.amountCents)} on ${longDate(f.nextBill.dueDate)}` });

  return {
    number: f.referenceCode,
    title: "Receipt",
    amountLabel: usd(f.amountCents),
    paidOn: longDate(f.paidAt),
    item: receiptItem(f),
    rows,
  };
}
