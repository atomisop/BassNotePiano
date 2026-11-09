import { getNumberSetting } from "@/lib/siteSettings";
import { DEFAULT_PRICING, type PricingConfig } from "@/lib/classCreditPricing";

/**
 * The owner's current prices (Admin > Pricing, stored as settings). Read this on the server and pass it down: the pricing math itself
 * (classCreditPricing.ts) is plain functions with no database, so the browser can run them too.
 *
 * STRICT: if the settings cannot be read this throws. Everything that creates, changes or charges a plan or payment uses this one, so a
 * failed read can never turn into a bill at the built-in price (P0-BIZ-01). A page that only shows prices uses getPricingForDisplay().
 */
export async function getPricingConfig(): Promise<PricingConfig> {
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
}

/**
 * For screens that only SHOW prices. If the settings cannot be read it returns the built-in prices and says so (`stale: true`), so a page
 * can tell the visitor the numbers may be out of date instead of passing them off as current. Checkout still uses the strict version.
 */
export async function getPricingForDisplay(): Promise<{ config: PricingConfig; stale: boolean }> {
  try {
    return { config: await getPricingConfig(), stale: false };
  } catch (err) {
    console.error("Pricing settings could not be read, showing the built-in prices as possibly out of date:", err);
    return { config: DEFAULT_PRICING, stale: true };
  }
}

/** Display-only shorthand for pages that do not show a stale notice themselves. */
export async function getDisplayPricingConfig(): Promise<PricingConfig> {
  return (await getPricingForDisplay()).config;
}
