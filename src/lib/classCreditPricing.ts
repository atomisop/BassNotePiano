// Split out from classSchedule.ts on purpose — that module pulls in Prisma,
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

// Checked in descending minQuantity order — the first (largest) threshold
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

// Starter/Standard/Best Value — each sits exactly on a discount threshold
// above, so its own math is just calculateClassCreditTotal(quantity).
export const PRESET_BUNDLES: PresetBundle[] = [
  { id: "starter", label: "Starter", quantity: 4 },
  { id: "standard", label: "Standard", quantity: 10 },
  { id: "best-value", label: "Best Value", quantity: 20 },
];

export const MIN_CUSTOM_QUANTITY = 1;
export const MAX_CUSTOM_QUANTITY = 200;

export interface CreditTotal {
  quantity: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  discountRate: number;
  perCreditCents: number;
}

export function calculateClassCreditTotal(quantity: number): CreditTotal {
  const q = Math.min(MAX_CUSTOM_QUANTITY, Math.max(MIN_CUSTOM_QUANTITY, Math.floor(quantity)));
  const tier = TIERS.find((t) => q >= t.minQuantity) ?? TIERS[TIERS.length - 1];
  const subtotalCents = q * CREDIT_BASE_PRICE_CENTS;
  const discountCents = Math.round(subtotalCents * tier.discountRate);
  const totalCents = subtotalCents - discountCents;
  return {
    quantity: q,
    subtotalCents,
    discountCents,
    totalCents,
    discountRate: tier.discountRate,
    perCreditCents: Math.round(totalCents / q),
  };
}
