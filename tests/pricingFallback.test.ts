import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/siteSettings", () => ({ getNumberSetting: vi.fn() }));
import { getNumberSetting } from "@/lib/siteSettings";
import { getPricingConfig, getPricingForDisplay } from "@/lib/pricing";
import { DEFAULT_PRICING } from "@/lib/classCreditPricing";

const read = vi.mocked(getNumberSetting);

describe("pricing settings outage (P0-BIZ-01)", () => {
  beforeEach(() => {
    read.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("uses the owner's live prices when the settings can be read", async () => {
    const live: Record<string, number> = {
      "pricing.monthlyPlanDollars": 250,
      "pricing.term3DiscountPercent": 5,
      "pricing.term6DiscountPercent": 10,
      "pricing.familyDiscountPercent": 20,
      "pricing.extraClassPriceDollars": 70,
    };
    read.mockImplementation(async (key: string) => live[key]);
    const config = await getPricingConfig();
    expect(config.monthlyBaseCents).toBe(25000);
    expect(config.term6DiscountRate).toBeCloseTo(0.1);
    expect(await getPricingForDisplay()).toEqual({ config, stale: false });
  });

  it("money code (strict) fails instead of using built-in prices", async () => {
    read.mockRejectedValue(new Error("database unavailable"));
    await expect(getPricingConfig()).rejects.toThrow("database unavailable");
  });

  it("a display page gets the built-in prices flagged as stale, never as live", async () => {
    read.mockRejectedValue(new Error("database unavailable"));
    expect(await getPricingForDisplay()).toEqual({ config: DEFAULT_PRICING, stale: true });
  });
});
