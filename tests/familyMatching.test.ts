import { describe, expect, it } from "vitest";
import { receiptMatchVia, pickMatch, pickNearMissCode } from "@/lib/paymentEmail";
import { paymentReferenceCode } from "@/lib/paymentReference";

// A family member's monthly bill: the member is the account holder, the family's payer is the one allowed to settle it.
const bill = {
  id: "clpayplan0000000000000abcde",
  status: "AWAITING_TRANSFER" as const,
  amountCents: 19999,
  senderName: null,
  user: { name: "Kid Tester", payerAliases: [] },
  paymentPlan: { familyGroup: { payer: { name: "Parent Tester", payerAliases: [] } } },
};

describe("a family member's bill", () => {
  it("is settled by the family's payer, by name or by code", () => {
    expect(receiptMatchVia(bill, { senderName: "Parent Tester", amountCents: 19999, memo: null })).toBe("name");
    expect(receiptMatchVia(bill, { senderName: "PARENT TESTER", amountCents: 19999, memo: `Bass Note Piano ${paymentReferenceCode(bill.id)}` })).toBe("code");
  });

  it("is not settled by the member's own account, even with the right code", () => {
    expect(receiptMatchVia(bill, { senderName: "Kid Tester", amountCents: 19999, memo: null })).toBeNull();
    expect(receiptMatchVia(bill, { senderName: "Kid Tester", amountCents: 19999, memo: paymentReferenceCode(bill.id) })).toBeNull();
  });

  it("is not settled by a third account that knows the code", () => {
    expect(pickMatch([bill], { senderName: "Someone Else", amountCents: 19999, memo: paymentReferenceCode(bill.id) })).toBeNull();
  });

  it("is never claimed by a mistyped code", () => {
    const typo = paymentReferenceCode(bill.id).slice(0, -1) + "Z";
    expect(pickNearMissCode([bill], { senderName: "Someone Else", amountCents: 19999, memo: typo }, new Set())).toBeNull();
  });

  it("does not change the rules for an ordinary student's payment", () => {
    const solo = { ...bill, paymentPlan: null, user: { name: "Kid Tester", payerAliases: [] } };
    expect(receiptMatchVia(solo, { senderName: "Kid Tester", amountCents: 19999, memo: null })).toBe("name");
  });

  it("applies to the combined first payment too: only the payer's account settles it", () => {
    const start = { id: "clfamstart00000000000000xyz", status: "AWAITING_TRANSFER" as const, amountCents: 32998, senderName: null, purpose: "FAMILY_PLAN_START", user: { name: "Parent Tester", payerAliases: [] }, paymentPlan: null };
    expect(receiptMatchVia(start, { senderName: "Kid Tester", amountCents: 32998, memo: paymentReferenceCode(start.id) })).toBeNull();
    expect(receiptMatchVia(start, { senderName: "Parent Tester", amountCents: 32998, memo: paymentReferenceCode(start.id) })).toBe("code");
  });
});
