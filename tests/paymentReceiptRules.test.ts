import { describe, expect, it } from "vitest";
import { buildReceipt, receiptItem, type ReceiptFacts } from "@/lib/paymentReceiptRules";

const base: ReceiptFacts = {
  referenceCode: "BNP-4H9E8",
  purpose: "PAYMENT_PLAN_INSTALLMENT",
  method: "ZELLE",
  amountCents: 19999,
  paidAt: new Date("2026-10-31T16:00:00Z"),
  accountName: "Alex Demo",
  accountEmail: "alex@example.com",
  senderName: null,
  creditsStored: 8,
  plan: { cadence: "MIN_60_WEEKLY", term: "TERM_3", termMonths: 3, installmentNumber: 2 },
  periodEnd: new Date("2026-11-28T16:00:00Z"),
  nextBill: { dueDate: new Date("2026-11-28T16:00:00Z"), amountCents: 19999 },
  groupSize: null,
  extraClassAt: null,
};

const row = (facts: ReceiptFacts, label: string) => buildReceipt(facts).rows.find((r) => r.label === label)?.value;

describe("payment receipts", () => {
  it("names a plan payment by plan and payment number", () => {
    expect(receiptItem(base)).toBe("3 Months plan, 45 min/week, payment 2 of 3");
  });

  it("shows the amount, date and receipt number", () => {
    const r = buildReceipt(base);
    expect(r.amountLabel).toBe("$199.99");
    expect(r.number).toBe("BNP-4H9E8");
    expect(r.paidOn).toBe("October 31, 2026");
  });

  it("covers exactly 28 days, never a calendar month", () => {
    expect(row(base, "Covers")).toBe("Oct 31 to Nov 28 (28 days)");
  });

  it("uses the bank's sender name when there is one, else the account name", () => {
    expect(row(base, "Paid by")).toBe("Alex Demo");
    expect(row({ ...base, senderName: "Alexander Demo" }, "Paid by")).toBe("Alexander Demo");
    expect(row({ ...base, senderName: "ALEX  O'BRIEN-DEMO" }, "Paid by")).toBe("Alex O'Brien-Demo");
  });

  it("leaves out what does not apply", () => {
    const extra = buildReceipt({ ...base, purpose: "CLASS_CREDITS", plan: null, periodEnd: null, nextBill: null, extraClassAt: new Date("2026-11-04T23:30:00Z"), method: "VENMO" });
    expect(extra.item).toBe("Extra class on Nov 4");
    expect(extra.rows.map((r) => r.label)).toEqual(["Receipt number", "Paid on", "Paid by", "Method", "Account", "Classes added"]);
    expect(extra.rows.find((r) => r.label === "Method")?.value).toBe("Venmo");
  });

  it("names a group start by its size", () => {
    expect(receiptItem({ ...base, purpose: "FAMILY_PLAN_START", groupSize: 3 })).toBe("Group plan, first payment for 3 people");
  });
});
