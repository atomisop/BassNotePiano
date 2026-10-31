import { getNumberSetting } from "@/lib/siteSettings";
import { DEFAULT_PRICING, type PricingConfig } from "@/lib/classCreditPricing";

/**
 * The owner's current prices (Admin > Pricing, stored as settings). Read this on the server and pass it down: the pricing math itself
 * (classCreditPricing.ts) is plain functions with no database, so the browser can run them too. If the settings cannot be read the
 * built-in prices are used, so a page never fails over a price.
 */
export async function getPricingConfig(): Promise<PricingConfig> {
  try {
    const [monthly, term3, term6, family, extra] = await Promise.all([
      getNumberSetting("pricing.monthlyPlanDollars"),
      getNumberSetting("pricing.term3DiscountPercent"),
      getNumberSetting("pricing.term6DiscountPercent"),
      getNumberSetting("pricing.familyDiscountPercent"),
      getNumberSetting("pricing.extraClassPriceDollars"),
    ]);
    return {
      monthlyBaseCents: Math.round(monthly * 100),
      term3DiscountRate: term3 / 100,
      term6DiscountRate: term6 / 100,
      familyDiscountRate: family / 100,
      extraClassCents: Math.round(extra * 100),
    };
  } catch (err) {
    console.error("Pricing settings could not be read, using the built-in prices:", err);
    return DEFAULT_PRICING;
  }
}
