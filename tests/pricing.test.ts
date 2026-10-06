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
