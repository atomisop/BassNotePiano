import { describe, expect, it } from "vitest";
import { calculateFamilyBundleTotal, MAX_FAMILY_BUNDLE_RECIPIENTS, MIN_FAMILY_BUNDLE_RECIPIENTS } from "@/lib/classCreditPricing";

describe("calculateFamilyBundleTotal", () => {
  it("grows with each recipient and always discounts the combined price", () => {
    const two = calculateFamilyBundleTotal("MIN_60_WEEKLY", "TERM_6", 2);
    const three = calculateFamilyBundleTotal("MIN_60_WEEKLY", "TERM_6", 3);
    expect(three.totalCents).toBeGreaterThan(two.totalCents);
    expect(two.totalCents).toBeLessThan(two.combinedBeforeFamilyDiscountCents);
    expect(two.familyDiscountCents).toBe(two.combinedBeforeFamilyDiscountCents - two.totalCents);
  });
  it("keeps the count between the minimum and the maximum", () => {
    expect(calculateFamilyBundleTotal("MIN_60_WEEKLY", "TERM_6", 0).recipientCount).toBe(MIN_FAMILY_BUNDLE_RECIPIENTS);
    expect(calculateFamilyBundleTotal("MIN_60_WEEKLY", "TERM_6", 999).recipientCount).toBe(MAX_FAMILY_BUNDLE_RECIPIENTS);
  });
});

import { calculatePaymentPlanRate, DEFAULT_PRICING, discountedPlanPriceCents, MAX_PERSONAL_DISCOUNT_PERCENT } from "@/lib/classCreditPricing";

describe("the owner's prices", () => {
  it("default to today's prices, so nothing changes until the owner changes a number", () => {
    expect(calculatePaymentPlanRate("MIN_60_WEEKLY", "MONTHLY").installmentAmountCents).toBe(21999);
    expect(calculatePaymentPlanRate("MIN_60_WEEKLY", "TERM_3").installmentAmountCents).toBe(19999);
    expect(calculatePaymentPlanRate("MIN_60_WEEKLY", "TERM_6").installmentAmountCents).toBe(17999);
    expect(calculatePaymentPlanRate("MIN_60_WEEKLY", "MONTHLY", DEFAULT_PRICING)).toEqual(calculatePaymentPlanRate("MIN_60_WEEKLY", "MONTHLY"));
  });

  it("follow a changed monthly price, term discounts and family discount", () => {
    const cfg = { ...DEFAULT_PRICING, monthlyBaseCents: 30000, term3DiscountRate: 0.2, term6DiscountRate: 0.25, familyDiscountRate: 0.2 };
    expect(calculatePaymentPlanRate("MIN_60_WEEKLY", "MONTHLY", cfg).installmentAmountCents).toBe(30000 - 1);
    expect(calculatePaymentPlanRate("MIN_60_WEEKLY", "TERM_3", cfg).installmentAmountCents).toBe(23999); // $240 raw, just under it
    expect(calculatePaymentPlanRate("MIN_60_WEEKLY", "TERM_6", cfg).installmentAmountCents).toBe(22499);
    const solo = calculatePaymentPlanRate("MIN_60_WEEKLY", "MONTHLY", cfg).installmentAmountCents;
    expect(calculateFamilyBundleTotal("MIN_60_WEEKLY", "MONTHLY", 2, cfg).perStudentMonthlyCents).toBeLessThan(solo * 0.85);
  });

  it("leave the retired 30 minute plan at its own price", () => {
    const cfg = { ...DEFAULT_PRICING, monthlyBaseCents: 99900 };
    expect(calculatePaymentPlanRate("MIN_30_WEEKLY", "MONTHLY", cfg)).toEqual(calculatePaymentPlanRate("MIN_30_WEEKLY", "MONTHLY"));
  });
});

describe("a personal discount", () => {
  it("takes a percent off and ends on .99 like every other price", () => {
    expect(discountedPlanPriceCents(21999, 25)).toBe(16499);
    expect(discountedPlanPriceCents(21999, 10)).toBe(19799);
    expect(discountedPlanPriceCents(17999, 50)).toBe(8999);
  });
  it("changes nothing at zero, is capped, and never goes below 99 cents", () => {
    expect(discountedPlanPriceCents(21999, 0)).toBe(21999);
    expect(discountedPlanPriceCents(21999, -5)).toBe(21999);
    expect(discountedPlanPriceCents(21999, 100)).toBe(discountedPlanPriceCents(21999, MAX_PERSONAL_DISCOUNT_PERCENT));
    expect(discountedPlanPriceCents(100, 90)).toBeGreaterThanOrEqual(99);
  });
});
