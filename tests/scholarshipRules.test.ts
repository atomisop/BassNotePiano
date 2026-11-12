import { describe, expect, it } from "vitest";
import { formatScholarshipCode, makeScholarshipCode, normalizeScholarshipCode, scholarshipStatus } from "@/lib/scholarshipRules";

describe("scholarship rules", () => {
  it("makes 16 digit codes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = makeScholarshipCode();
      expect(c).toMatch(/^\d{16}$/);
      seen.add(c);
    }
    expect(seen.size).toBe(200);
  });
  it("reads pasted codes with spaces or dashes, rejects anything else", () => {
    expect(normalizeScholarshipCode("1234 5678-9012 3456")).toBe("1234567890123456");
    for (const bad of ["123", "12345678901234567", "abcd567890123456", null, 5]) expect(normalizeScholarshipCode(bad)).toBeNull();
  });
  it("formats in groups of four", () => expect(formatScholarshipCode("1234567890123456")).toBe("1234 5678 9012 3456"));
  it("reports status", () => {
    const now = new Date("2026-11-06T12:00:00Z");
    const base = { claimedAt: null, revokedAt: null, expiresAt: null };
    expect(scholarshipStatus(base, now)).toBe("available");
    expect(scholarshipStatus({ ...base, claimedAt: now, revokedAt: now }, now)).toBe("ended");
    expect(scholarshipStatus({ ...base, expiresAt: new Date("2026-11-05T00:00:00Z") }, now)).toBe("expired");
    expect(scholarshipStatus({ ...base, revokedAt: now }, now)).toBe("revoked");
  });
});

import { discountPercentForTerm, SCHOLARSHIP_TERM } from "@/lib/classCreditPricing";

describe("discountPercentForTerm", () => {
  it("applies a scholarship to the 6 Month plan only, and takes the better of the two discounts", () => {
    expect(SCHOLARSHIP_TERM).toBe("TERM_6");
    expect(discountPercentForTerm({ percent: 0, scholarshipPercent: 30 }, "TERM_6")).toBe(30);
    for (const t of ["MONTHLY", "TERM_3", "TERM_12"]) expect(discountPercentForTerm({ percent: 0, scholarshipPercent: 30 }, t)).toBe(0);
    expect(discountPercentForTerm({ percent: 20, scholarshipPercent: 30 }, "TERM_6")).toBe(30);
    expect(discountPercentForTerm({ percent: 40, scholarshipPercent: 30 }, "TERM_6")).toBe(40);
    expect(discountPercentForTerm({ percent: 20, scholarshipPercent: 30 }, "TERM_3")).toBe(20);
  });
});

import { discountedPlanPriceCents, MAX_PERSONAL_DISCOUNT_PERCENT, MAX_SCHOLARSHIP_PERCENT } from "@/lib/classCreditPricing";

describe("the 100% scholarship", () => {
  it("is free at 100, and 91 to 99 are charged at their own percent", () => {
    expect(MAX_SCHOLARSHIP_PERCENT).toBe(100);
    expect(MAX_PERSONAL_DISCOUNT_PERCENT).toBe(90);
    expect(discountedPlanPriceCents(21999, 100)).toBe(0);
    expect(discountedPlanPriceCents(21999, 99)).toBeGreaterThan(0);
    expect(discountedPlanPriceCents(21999, 95)).toBeLessThan(discountedPlanPriceCents(21999, 90));
  });
});
