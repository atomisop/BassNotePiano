import { describe, expect, it } from "vitest";
import {
  CREDIT_BASE_PRICE_CENTS,
  MAX_CUSTOM_QUANTITY,
  MIN_CUSTOM_QUANTITY,
  PRESET_BUNDLES,
  calculateClassCreditTotal,
} from "./classCreditPricing";

describe("calculateClassCreditTotal", () => {
  it("applies no discount below the first tier", () => {
    const result = calculateClassCreditTotal(1);
    expect(result).toEqual({
      quantity: 1,
      subtotalCents: 5000,
      discountCents: 0,
      totalCents: 5000,
      discountRate: 0,
      perCreditCents: 5000,
    });
  });

  it("stays undiscounted just below the 4-credit tier", () => {
    expect(calculateClassCreditTotal(3).discountRate).toBe(0);
  });

  it("applies the 10% tier exactly at 4 credits", () => {
    const result = calculateClassCreditTotal(4);
    expect(result.discountRate).toBe(0.1);
    expect(result.subtotalCents).toBe(20_000);
    expect(result.discountCents).toBe(2_000);
    expect(result.totalCents).toBe(18_000);
    expect(result.perCreditCents).toBe(4_500);
  });

  it("stays at the 10% tier just below 10 credits", () => {
    expect(calculateClassCreditTotal(9).discountRate).toBe(0.1);
  });

  it("applies the 20% tier exactly at 10 credits", () => {
    const result = calculateClassCreditTotal(10);
    expect(result.discountRate).toBe(0.2);
    expect(result.subtotalCents).toBe(50_000);
    expect(result.discountCents).toBe(10_000);
    expect(result.totalCents).toBe(40_000);
    expect(result.perCreditCents).toBe(4_000);
  });

  it("stays at the 20% tier just below 20 credits", () => {
    expect(calculateClassCreditTotal(19).discountRate).toBe(0.2);
  });

  it("applies the 30% tier exactly at 20 credits", () => {
    const result = calculateClassCreditTotal(20);
    expect(result.discountRate).toBe(0.3);
    expect(result.subtotalCents).toBe(100_000);
    expect(result.discountCents).toBe(30_000);
    expect(result.totalCents).toBe(70_000);
    expect(result.perCreditCents).toBe(3_500);
  });

  it("clamps below MIN_CUSTOM_QUANTITY up to the minimum", () => {
    expect(calculateClassCreditTotal(0).quantity).toBe(MIN_CUSTOM_QUANTITY);
    expect(calculateClassCreditTotal(-5).quantity).toBe(MIN_CUSTOM_QUANTITY);
  });

  it("clamps above MAX_CUSTOM_QUANTITY down to the maximum", () => {
    const result = calculateClassCreditTotal(201);
    expect(result.quantity).toBe(MAX_CUSTOM_QUANTITY);
    expect(result).toEqual(calculateClassCreditTotal(MAX_CUSTOM_QUANTITY));
  });

  it("floors a fractional quantity before pricing it", () => {
    const result = calculateClassCreditTotal(2.7);
    expect(result.quantity).toBe(2);
    expect(result.discountRate).toBe(0);
    expect(result.subtotalCents).toBe(2 * CREDIT_BASE_PRICE_CENTS);
  });

  it("prices every preset bundle at its intended discount tier", () => {
    const expectedRateByBundleId: Record<string, number> = {
      starter: 0.1,
      standard: 0.2,
      "best-value": 0.3,
    };
    for (const bundle of PRESET_BUNDLES) {
      expect(calculateClassCreditTotal(bundle.quantity).discountRate).toBe(
        expectedRateByBundleId[bundle.id],
      );
    }
  });
});
