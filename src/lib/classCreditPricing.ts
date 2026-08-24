// Split out from classSchedule.ts on purpose: that module pulls in Prisma,
// which must never end up in a "use client" bundle (the purchase page's
// quantity/tier picker needs this pure math client-side).

export const CREDIT_BASE_PRICE_CENTS = 3499; // $34.99 per credit (1 credit = 30 min), full price

/** Pre-discount per-credit price, kept only so marketing pages can show a struck-through "was" price and a % off badge. */
export const CREDIT_ORIGINAL_PRICE_CENTS = 5000;

/** Rounded down so the badge never overstates the real discount. */
export const CREDIT_DISCOUNT_PERCENT = Math.floor((1 - CREDIT_BASE_PRICE_CENTS / CREDIT_ORIGINAL_PRICE_CENTS) * 100);

interface PriceTier {
  minQuantity: number;
  discountRate: number;
}

// Checked in descending minQuantity order. The first (largest) threshold
// a quantity clears wins. This is the one discount ladder for everything:
// the three named presets below are just convenient shortcuts onto it, and
// typing a custom quantity resolves through the exact same tiers.
const TIERS: PriceTier[] = [
  { minQuantity: 20, discountRate: 0.3 },
  { minQuantity: 10, discountRate: 0.2 },
  { minQuantity: 4, discountRate: 0.1 },
  { minQuantity: 1, discountRate: 0 },
];

export interface PresetBundle {
  id: string;
  label: string;
  quantity: number;
}

// Starter/Standard/Best Value: each sits exactly on a discount threshold
// above, so its own math is just calculateClassCreditTotal(quantity).
export const PRESET_BUNDLES: PresetBundle[] = [
  { id: "starter", label: "Starter", quantity: 4 },
  { id: "standard", label: "Standard", quantity: 10 },
  { id: "best-value", label: "Best Value", quantity: 20 },
];

export const MIN_CUSTOM_QUANTITY = 1;
export const MAX_CUSTOM_QUANTITY = 200;

// An extra promotional markdown on top of a bundle tier's own size discount,
// applied only where tier.discountRate > 0 (Starter, Standard, Best Value,
// and any custom quantity of 4+), not the single-credit rate. Framed to
// customers as one plain markdown from the price the tier already showed,
// not as two percentages stacked and added together: the UI shows "was
// $125.99, now $87.99, limited time" for Starter, never "10% off, plus 30%
// off". Currently a manual on/off switch, not a real countdown: flip this
// back to 0 (or remove the extra step in calculateClassCreditTotal below)
// when the promotion ends. Feeds into calculateFamilyBundleTotal too, since
// that function calls calculateClassCreditTotal for its per-recipient price.
export const LIMITED_TIME_BUNDLE_DISCOUNT_RATE = 0.3;

export interface CreditTotal {
  quantity: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  discountRate: number;
  perCreditCents: number;
  /** The bundle's own price before the limited-time markdown: what totalCents used to be, and what the "was" price shows struck through. Equal to totalCents when hasLimitedTimeDiscount is false. */
  preLimitedTimeTotalCents: number;
  /** Dollar amount of just the limited-time layer, 0 when it doesn't apply. */
  limitedTimeDiscountCents: number;
  hasLimitedTimeDiscount: boolean;
}

/** Nearest dollar, then a cent under it: the same $X.99 "charm price" every other price in the app ends on. */
function toCharmPriceCents(cents: number): number {
  return Math.round(cents / 100) * 100 - 1;
}

export function calculateClassCreditTotal(quantity: number): CreditTotal {
  const q = Math.min(MAX_CUSTOM_QUANTITY, Math.max(MIN_CUSTOM_QUANTITY, Math.floor(quantity)));
  const tier = TIERS.find((t) => q >= t.minQuantity) ?? TIERS[TIERS.length - 1];
  const subtotalCents = q * CREDIT_BASE_PRICE_CENTS;
  const rawTotalCents = subtotalCents - Math.round(subtotalCents * tier.discountRate);
  // Charm-priced rather than the raw discount math, so every discounted
  // quantity's total (bundle cards, checkout, and the actual amount
  // charged, since this same totalCents is what gets billed) ends in .99
  // instead of landing wherever the percentage happens to fall (e.g.
  // $125.96). Only for tier.discountRate > 0: rounding *up* to the nearest
  // .99 can land a cent or two above the raw total (e.g. 2 credits, no
  // bundle discount, $69.98 rounds up to $69.99), fine when there's a
  // real discount cushioning it, but for an undiscounted quantity that
  // would silently charge a hair more than quantity × CREDIT_BASE_PRICE_CENTS,
  // breaking the "1 credit is always $34.99, that never changes" promise
  // on the pricing page.
  const preLimitedTimeTotalCents = tier.discountRate > 0 ? toCharmPriceCents(rawTotalCents) : rawTotalCents;

  const hasLimitedTimeDiscount = tier.discountRate > 0;
  const rawLimitedTotalCents = hasLimitedTimeDiscount
    ? preLimitedTimeTotalCents - Math.round(preLimitedTimeTotalCents * LIMITED_TIME_BUNDLE_DISCOUNT_RATE)
    : preLimitedTimeTotalCents;
  const totalCents = hasLimitedTimeDiscount ? toCharmPriceCents(rawLimitedTotalCents) : rawLimitedTotalCents;

  // discountCents is derived from the final (possibly twice charm-rounded)
  // total, not the other way around, so subtotal - discount = total still
  // holds exactly on every line-item breakdown that uses it.
  const discountCents = subtotalCents - totalCents;
  return {
    quantity: q,
    subtotalCents,
    discountCents,
    totalCents,
    discountRate: tier.discountRate,
    perCreditCents: Math.round(totalCents / q),
    preLimitedTimeTotalCents,
    limitedTimeDiscountCents: preLimitedTimeTotalCents - totalCents,
    hasLimitedTimeDiscount,
  };
}

// ---------------------------------------------------------------------------
// Family bundle: one of the four tiers above, bought at once for 2+
// separate, already-existing accounts (see createFamilyBundlePayment in
// payments.ts for the account verification this is paired with; this file
// only does the math, on purpose, same "no Prisma in here" reason as the
// header comment). An *additional* 25% off, stacked on top of whatever
// price the chosen tier already carries (bundle size discount and the
// limited-time markdown both included, since this calls
// calculateClassCreditTotal above for that price), e.g. 3x Starter is
// 3 × Starter's own current price, then 25% off that combined total.
// ---------------------------------------------------------------------------

export const FAMILY_BUNDLE_DISCOUNT_RATE = 0.25;
export const MIN_FAMILY_BUNDLE_RECIPIENTS = 2;
export const MAX_FAMILY_BUNDLE_RECIPIENTS = 20; // matches MAX_CUSTOM_QUANTITY's own order of magnitude, a ceiling, not an expectation

export interface FamilyBundleTotal {
  tierQuantity: number;
  recipientCount: number;
  perRecipientCents: number; // the tier's own already-discounted price, unchanged, shown so the combined math is checkable
  combinedBeforeFamilyDiscountCents: number;
  familyDiscountCents: number;
  totalCents: number;
}

export function calculateFamilyBundleTotal(tierQuantity: number, recipientCount: number): FamilyBundleTotal {
  const recipients = Math.min(MAX_FAMILY_BUNDLE_RECIPIENTS, Math.max(MIN_FAMILY_BUNDLE_RECIPIENTS, Math.floor(recipientCount)));
  const perRecipient = calculateClassCreditTotal(tierQuantity);
  const combinedBeforeFamilyDiscountCents = perRecipient.totalCents * recipients;
  const rawTotalCents = combinedBeforeFamilyDiscountCents - Math.round(combinedBeforeFamilyDiscountCents * FAMILY_BUNDLE_DISCOUNT_RATE);
  const totalCents = toCharmPriceCents(rawTotalCents);
  return {
    tierQuantity: perRecipient.quantity,
    recipientCount: recipients,
    perRecipientCents: perRecipient.totalCents,
    combinedBeforeFamilyDiscountCents,
    familyDiscountCents: combinedBeforeFamilyDiscountCents - totalCents,
    totalCents,
  };
}
