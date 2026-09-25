// Static curriculum metadata mirroring prisma/seed.ts (ScaleGroup rows).
// Kept as a plain TS module — not a DB call — so it can be imported from
// edge middleware, server components, and client components alike.

export interface ScaleGroupMeta {
  slug: string; // matches ScaleGroup.slug in the DB
  order: number; // matches ScaleGroup.order — defines required sequencing
  code: string; // "Scale 0"
  title: string;
  kinitName: string | null;
  formula: string; // degree formula, e.g. "1-b3-4-5-b7"
}

export const SCALE_GROUPS: ScaleGroupMeta[] = [
  {
    slug: "major-scale",
    order: 0,
    code: "Scale 1",
    title: "The Major Scale and the Seven Modes",
    kinitName: null,
    formula: "1-2-3-4-5-6-7",
  },
  {
    slug: "natural-minor",
    order: 1,
    code: "Scale 2",
    title: "The Natural Minor Scale",
    kinitName: null,
    formula: "1-2-b3-4-5-b6-b7",
  },
  {
    slug: "harmonic-minor",
    order: 2,
    code: "Scale 3",
    title: "The Harmonic Minor Scale",
    kinitName: null,
    formula: "1-2-b3-4-5-b6-7",
  },
  {
    slug: "melodic-minor",
    order: 3,
    code: "Scale 4",
    title: "The Melodic Minor Scale",
    kinitName: null,
    formula: "1-2-b3-4-5-6-7",
  },
  {
    slug: "parallel-minor",
    order: 4,
    code: "Scale 5",
    title: "Parallel Minor",
    kinitName: null,
    formula: "1-2-b3-4-5-b6-b7",
  },
  {
    slug: "chromatic-scale",
    order: 5,
    code: "Scale 6",
    title: "The Chromatic Scale",
    kinitName: null,
    formula: "1-b2-2-b3-3-4-b5-5-b6-6-b7-7",
  },
  {
    slug: "tizita-major",
    order: 6,
    code: "Scale 7",
    title: "Major Pentatonic",
    kinitName: "Tizita Major",
    formula: "1-2-3-5-6",
  },
  {
    slug: "tizita-minor",
    order: 7,
    code: "Scale 8",
    title: "Minor Pentatonic (Tizita)",
    kinitName: "Tizita Minor",
    formula: "1-2-b3-5-b6",
  },
  {
    slug: "bati-major",
    order: 8,
    code: "Scale 9",
    title: "Bati Major",
    kinitName: "Bati Major",
    formula: "1-3-4-5-7",
  },
  {
    slug: "bati-minor",
    order: 9,
    code: "Scale 10",
    title: "Bati Minor",
    kinitName: "Bati Minor",
    formula: "1-b3-4-5-b7",
  },
  {
    slug: "bati-lydian",
    order: 10,
    code: "Scale 11",
    title: "Bati Lydian",
    kinitName: "Bati Lydian",
    formula: "1-3-#4-5-7",
  },
  {
    slug: "ambassel-major",
    order: 11,
    code: "Scale 12",
    title: "Ambassel Major",
    kinitName: "Ambassel Major",
    formula: "1-2-4-5-6",
  },
  {
    slug: "ambassel-minor",
    order: 12,
    code: "Scale 13",
    title: "Ambassel Minor",
    kinitName: "Ambassel Minor",
    formula: "1-b2-4-5-b6",
  },
  {
    slug: "anchihoye",
    order: 13,
    code: "Scale 14",
    title: "Anchihoye",
    kinitName: "Anchihoye",
    formula: "1-b2-4-b5-6",
  },
  {
    slug: "anchihoye-dorian",
    order: 14,
    code: "Scale 15",
    title: "Anchihoye Dorian",
    kinitName: "Anchihoye Dorian",
    formula: "1-2-4-5-b7",
  },
];

export const SCALE_SLUGS = SCALE_GROUPS.map((s) => s.slug);

/** One-time purchase price for lifetime access to every scale group above. */
export const CURRICULUM_PRICE_CENTS = 6999;

/** "Compare at" list price, kept only so marketing pages can show a struck-through "was" price and a % off badge. */
export const CURRICULUM_ORIGINAL_PRICE_CENTS = 9999;

/** Rounded down so the badge never overstates the real discount. */
export const CURRICULUM_DISCOUNT_PERCENT = Math.floor(
  (1 - CURRICULUM_PRICE_CENTS / CURRICULUM_ORIGINAL_PRICE_CENTS) * 100,
);

// ---------------------------------------------------------------------------
// Family bundle: the same one-time curriculum unlock, bought at once for 2+
// separate, already-existing accounts (a parent unlocking it for each of
// her kids), for an extra 20% off the combined total. Same shape as
// FAMILY_BUNDLE's own class-credit bundle in classCreditPricing.ts
// (calculateFamilyBundleTotal), just a flat per-recipient price instead of a
// cadence/term-dependent one, since curriculum access is a single flat
// purchase with no term or cadence to pick. See createCurriculumFamilyBundlePayment
// in payments.ts for the account verification (and the "does anyone already
// have access" check, unique to this bundle) this is paired with.
// ---------------------------------------------------------------------------

export const CURRICULUM_FAMILY_BUNDLE_DISCOUNT_RATE = 0.2;
export const MIN_CURRICULUM_FAMILY_BUNDLE_RECIPIENTS = 2;
export const MAX_CURRICULUM_FAMILY_BUNDLE_RECIPIENTS = 20; // matches the class-credit bundle's own ceiling

export interface CurriculumFamilyBundleTotal {
  recipientCount: number;
  /** CURRICULUM_PRICE_CENTS, unchanged. Shown so the combined math is checkable against what one person would pay alone. */
  perRecipientCents: number;
  combinedBeforeFamilyDiscountCents: number;
  familyDiscountCents: number;
  totalCents: number;
}

export function calculateCurriculumFamilyBundleTotal(recipientCount: number): CurriculumFamilyBundleTotal {
  const combinedBeforeFamilyDiscountCents = CURRICULUM_PRICE_CENTS * recipientCount;
  const totalCents = combinedBeforeFamilyDiscountCents - Math.round(combinedBeforeFamilyDiscountCents * CURRICULUM_FAMILY_BUNDLE_DISCOUNT_RATE);
  return {
    recipientCount,
    perRecipientCents: CURRICULUM_PRICE_CENTS,
    combinedBeforeFamilyDiscountCents,
    familyDiscountCents: combinedBeforeFamilyDiscountCents - totalCents,
    totalCents,
  };
}

export function scaleIndexFromSlug(slug: string): number {
  return SCALE_SLUGS.indexOf(slug);
}

export function scaleGroupBySlug(slug: string): ScaleGroupMeta | undefined {
  return SCALE_GROUPS.find((s) => s.slug === slug);
}

/** Minimum score (0-1) to pass a scale's conceptual/spelling quiz. */
export const QUIZ_PASS_THRESHOLD = 0.8;
