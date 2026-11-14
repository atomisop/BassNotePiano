import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING, OFFERED_PLAN_CADENCE, calculateFamilyBundleTotal } from "@/lib/classCreditPricing";
import { groupShareCents, groupShares } from "@/lib/groupShares";
import { checkoutTotals } from "@/lib/planCheckout";

describe("one person's share of a group price", () => {
  it("is the full price with no scholarship", () => {
    expect(groupShareCents(17999, "TERM_6", 0)).toBe(17999);
  });
  it("takes the scholarship off on the 6 Month plan only", () => {
    expect(groupShareCents(17999, "TERM_6", 50)).toBeLessThan(17999);
    expect(groupShareCents(17999, "TERM_6", 50)).toBeGreaterThan(0);
    for (const term of ["MONTHLY", "TERM_3", "TERM_12"]) expect(groupShareCents(17999, term, 50)).toBe(17999);
  });
  it("is free at 100%", () => {
    expect(groupShareCents(17999, "TERM_6", 100)).toBe(0);
  });
  it("never goes below free or above the price, whatever it is given", () => {
    expect(groupShareCents(17999, "TERM_6", 250)).toBe(0);
    expect(groupShareCents(17999, "TERM_6", -20)).toBe(17999);
    expect(groupShareCents(17999, "TERM_6", Number.NaN)).toBe(17999);
  });
  it("adds up everyone's share", () => {
    const { shares, totalCents } = groupShares(10000, "TERM_6", [0, 100, 50]);
    expect(shares[0]).toBe(10000);
    expect(shares[1]).toBe(0);
    expect(shares[2]).toBeGreaterThan(0);
    expect(totalCents).toBe(shares[0] + shares[1] + shares[2]);
  });
});

describe("the group checkout with scholarships on some people", () => {
  const base = { cadence: OFFERED_PLAN_CADENCE, pricing: DEFAULT_PRICING, audience: "FAMILY" as const, memberRows: ["a@x.com", "b@x.com"] };
  const groupRate = calculateFamilyBundleTotal(OFFERED_PLAN_CADENCE, "TERM_6", 3, DEFAULT_PRICING).perStudentMonthlyCents;

  it("without any scholarship is exactly what it always was", () => {
    const t = checkoutTotals({ ...base, term: "TERM_6" });
    expect(t.people).toBe(3);
    expect(t.perPaymentCents).toBe(groupRate);
    expect(t.sharesCents).toEqual([groupRate, groupRate, groupRate]);
    expect(t.firstPaymentCents).toBe(groupRate * 3);
  });
  it("gives the person with the scholarship a smaller share and leaves the others alone", () => {
    const t = checkoutTotals({ ...base, term: "TERM_6", memberScholarships: [100, 0, 0] });
    expect(t.sharesCents).toEqual([0, groupRate, groupRate]);
    expect(t.firstPaymentCents).toBe(groupRate * 2);
    expect(t.perPaymentCents).toBe(groupRate); // the group rate itself does not move
  });
  it("is free when everyone is at 100%", () => {
    const t = checkoutTotals({ ...base, term: "TERM_6", memberScholarships: [100, 100, 100] });
    expect(t.firstPaymentCents).toBe(0);
  });
  it("ignores scholarships on every other plan length", () => {
    for (const term of ["MONTHLY", "TERM_3"] as const) {
      const plain = checkoutTotals({ ...base, term });
      const withScholarship = checkoutTotals({ ...base, term, memberScholarships: [100, 100, 100] });
      expect(withScholarship.firstPaymentCents).toBe(plain.firstPaymentCents);
    }
  });
  it("leaves a solo plan alone (a solo scholarship is the account's own, not a per-person one)", () => {
    const t = checkoutTotals({ cadence: OFFERED_PLAN_CADENCE, pricing: DEFAULT_PRICING, audience: "SOLO", memberRows: [], term: "TERM_6", memberScholarships: [100] });
    expect(t.sharesCents).toEqual([t.perPaymentCents]);
    expect(t.firstPaymentCents).toBe(t.perPaymentCents);
  });
});
