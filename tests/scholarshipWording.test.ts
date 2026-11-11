import { describe, expect, it } from "vitest";
import {
  coveredBillNotice,
  installmentDueBody,
  installmentOverdueBody,
  mayContinueOnScholarship,
  partialScholarship,
  planPriceChangeNotice,
  scholarshipDueLine,
  scholarshipOverdueLine,
  scholarshipRenewedNotice,
} from "@/lib/scholarshipWording";
import { buildReceipt, receiptItem, type ReceiptFacts } from "@/lib/paymentReceiptRules";

const half = { term: "TERM_6", listCents: 17999, billCents: 8999, scholarshipPercent: 50, generalPercent: 0 };
/** What a full scholarship student must never read. */
const ASKS_FOR_MONEY = /installment due|bill ready|ready to pay|overdue|\$0\.00|\bpay (it|now|the|your)\b/i;

describe("a partial scholarship on a bill", () => {
  it("says what the scholarship covered and what is left, from the real amounts", () => {
    const s = partialScholarship(half);
    expect(s).toEqual({ percent: 50, coveredCents: 9000, leftCents: 8999 });
    expect(scholarshipDueLine(s!)).toBe("Your 50% scholarship covers $90.00 of this bill. $89.99 is left to pay.");
    expect(scholarshipOverdueLine(s!)).toBe("With your 50% scholarship, $89.99 is left to pay.");
  });

  it("is not named when it is not what prices the bill", () => {
    expect(partialScholarship({ ...half, term: "TERM_3" })).toBeNull();
    expect(partialScholarship({ ...half, scholarshipPercent: 0 })).toBeNull();
    expect(partialScholarship({ ...half, scholarshipPercent: 100, billCents: 0 })).toBeNull();
    // A bigger personal discount set the price, so the scholarship is not given the credit.
    expect(partialScholarship({ ...half, generalPercent: 60 })).toBeNull();
    // No known price before the discount (the owner set an exact price).
    expect(partialScholarship({ ...half, listCents: null })).toBeNull();
    expect(partialScholarship({ ...half, listCents: 8999 })).toBeNull();
  });

  it("goes into the due and overdue notices, which are unchanged without a scholarship", () => {
    const labels = { installmentLabel: "Installment 2 of 6", planLabel: "6 Months plan" };
    expect(installmentDueBody({ ...labels, scholarship: null })).toBe("Installment 2 of 6 on your 6 Months plan is ready to pay.");
    expect(installmentDueBody({ ...labels, scholarship: partialScholarship(half) })).toBe(
      "Installment 2 of 6 on your 6 Months plan is ready to pay. Your 50% scholarship covers $90.00 of this bill. $89.99 is left to pay.",
    );
    expect(installmentOverdueBody({ ...labels, overdueDays: 1, daysLeft: 6, scholarship: null })).toBe(
      "Installment 2 of 6 on your 6 Months plan is 1 day overdue. If it does not arrive in 6 days, your plan is canceled and you lose access to your account.",
    );
    expect(installmentOverdueBody({ ...labels, overdueDays: 2, daysLeft: 1, scholarship: partialScholarship(half) })).toBe(
      "Installment 2 of 6 on your 6 Months plan is 2 days overdue. With your 50% scholarship, $89.99 is left to pay. If it does not arrive in 1 day, your plan is canceled and you lose access to your account.",
    );
  });
});

describe("a full scholarship is never worded as a bill", () => {
  it("covered, continued and newly covered notices ask for nothing", () => {
    const covered = coveredBillNotice("4 credits are on your account");
    expect(covered).toEqual({ title: "Covered by your scholarship", body: "Your scholarship covers your next 28 days. 4 credits are on your account. Nothing to pay." });
    const bare = scholarshipRenewedNotice({});
    expect(bare).toEqual({ title: "Your scholarship plan continues", body: "Your scholarship plan continues. Nothing to pay." });
    const full = scholarshipRenewedNotice({ slot: "Mondays 6:30 PM", creditsNote: "4 credits are on your account for the next 28 days" });
    expect(full.body).toBe("Your scholarship plan continues. Nothing to pay. Your weekly class stays Mondays 6:30 PM. 4 credits are on your account for the next 28 days.");
    const free = planPriceChangeNotice({ fromCents: 17999, toCents: 0, openBillChanged: true });
    expect(free.title).toBe("Your scholarship covers your plan");
    for (const n of [covered, bare, full, free]) expect(`${n.title} ${n.body}`).not.toMatch(ASKS_FOR_MONEY);
  });

  it("a price that is not zero is still told as a price", () => {
    expect(planPriceChangeNotice({ fromCents: 17999, toCents: 8999, openBillChanged: true }).body).toBe(
      "Your price per payment is now $89.99 (it was $179.99). It applies to your next bill, and the bill that is open now has been updated.",
    );
    // Coming from a covered plan, the old "price" is not quoted as $0.00.
    expect(planPriceChangeNotice({ fromCents: 0, toCents: 17999, openBillChanged: false }).body).toBe("Your price per payment is now $179.99. It applies to your next bill.");
  });

  it("the record of a covered 28 days shows no amount, payer or method", () => {
    const facts: ReceiptFacts = {
      referenceCode: "BNP-ABCDE",
      purpose: "PAYMENT_PLAN_INSTALLMENT",
      method: "ZELLE",
      amountCents: 0,
      paidAt: new Date("2026-11-10T15:00:00Z"),
      accountName: "Sam Scholar",
      accountEmail: "sam@example.com",
      senderName: null,
      creditsStored: 8,
      plan: { cadence: "MIN_30_WEEKLY", term: "TERM_6", termMonths: 12, installmentNumber: 7 },
      periodEnd: new Date("2026-12-08T15:00:00Z"),
      nextBill: { dueDate: new Date("2026-12-08T15:00:00Z"), amountCents: 0 },
      groupSize: null,
      extraClassAt: null,
    };
    const receipt = buildReceipt(facts);
    expect(receipt.amountLabel).toBe("Covered");
    expect(receiptItem(facts)).toMatch(/28 days covered$/);
    expect(receipt.rows.map((r) => r.label)).toEqual(["Record number", "Covered on", "Account", "Covers", "Classes added", "Next 28 days"]);
    const text = [receipt.amountLabel, receipt.item, ...receipt.rows.map((r) => `${r.label} ${r.value}`)].join(" ");
    expect(text).not.toMatch(/\$0\.00|Paid by|Method|Next bill|payment 7 of 12/);
  });
});

describe("whether a plan goes on by itself", () => {
  const ok = { term: "TERM_6", priceCents: 0, inGroup: false, scholarshipPercent: 100, banned: false, paymentLocked: false, isAdmin: false };
  it("only a free solo 6 Month plan of an account in good standing with a 100% scholarship", () => {
    expect(mayContinueOnScholarship(ok)).toBe(true);
    expect(mayContinueOnScholarship({ ...ok, scholarshipPercent: 99 })).toBe(false);
    expect(mayContinueOnScholarship({ ...ok, scholarshipPercent: 0 })).toBe(false);
    expect(mayContinueOnScholarship({ ...ok, priceCents: 8999 })).toBe(false);
    expect(mayContinueOnScholarship({ ...ok, term: "TERM_3" })).toBe(false);
    expect(mayContinueOnScholarship({ ...ok, inGroup: true })).toBe(false);
    expect(mayContinueOnScholarship({ ...ok, banned: true })).toBe(false);
    expect(mayContinueOnScholarship({ ...ok, paymentLocked: true })).toBe(false);
    expect(mayContinueOnScholarship({ ...ok, isAdmin: true })).toBe(false);
  });
});
