// What each person on a group or parent plan pays. Pure, so the plan screen and the server use the SAME numbers (the server is the
// one that charges; the screen only shows what it will charge).
//
// A group has one per-person price (the group rate: the family bundle's per-student price, or the solo price for one child). A
// person's own scholarship then takes its percent off THEIR share, on the 6 Month plan only (SCHOLARSHIP_TERM), exactly as it does
// on a solo plan. The owner's general personal discount is not used in a group (a group keeps the group rate). A share can be $0;
// the first payment is the shares added up.
import { discountedPlanPriceCents, discountPercentForTerm } from "@/lib/classCreditPricing";

/** One person's share of the group price: `baseCents` less their scholarship, which only counts on the 6 Month plan. */
export function groupShareCents(baseCents: number, term: string, scholarshipPercent: number): number {
  const percent = discountPercentForTerm({ scholarshipPercent: Math.max(0, Math.min(100, Math.floor(scholarshipPercent || 0))) }, term);
  return percent > 0 ? discountedPlanPriceCents(baseCents, percent) : baseCents;
}

/** Every person's share, in the order of `percents` (a scholarship percent per person, 0 for none), and what they add up to. */
export function groupShares(baseCents: number, term: string, percents: number[]): { shares: number[]; totalCents: number } {
  const shares = percents.map((p) => groupShareCents(baseCents, term, p));
  return { shares, totalCents: shares.reduce((sum, s) => sum + s, 0) };
}
