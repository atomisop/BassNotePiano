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
  /** How many named variants this chapter bundles (e.g. Bati = Major/Minor/Lydian = 3). Drives priceCents. */
  sessionCount: number;
  priceCents: number;
}

/**
 * Pay-As-You-Go price per named variant/session. A chapter that bundles
 * multiple variants (Bati = 3, Anchihoye/Mixolydian = 2) is priced as that
 * many sessions — unlocking Scale 3 costs 3× this, not a flat rate — even
 * though the checklist/progression gate still sits at the whole-chapter
 * level (one read/practice/quiz per ScaleGroup, matching the book's own
 * chapter structure and the "6 scale groups" sequencing requirement).
 * sessionCount here must stay in sync with the variant lists in
 * scale-content.ts (not imported directly — that module pulls in the full
 * chord/theory engine, which middleware.ts, an edge runtime, has no reason
 * to bundle just to read a price).
 */
const PRICE_PER_SESSION_CENTS = 2500;

const SCALE_GROUP_DEFS: Omit<ScaleGroupMeta, "priceCents">[] = [
  {
    slug: "scale-0",
    order: 0,
    code: "Scale 0",
    title: "Diatonic Scale, Chromatic Scale & the Seven Modes",
    kinitName: null,
    formula: "1-2-3-4-5-6-7", // W-W-H-W-W-W-H
    sessionCount: 1,
  },
  {
    slug: "scale-1",
    order: 1,
    code: "Scale 1",
    title: "Major Pentatonic",
    kinitName: "Tizita Major (Full Tizita)",
    formula: "1-2-3-5-6",
    sessionCount: 1,
  },
  {
    slug: "scale-2",
    order: 2,
    code: "Scale 2",
    title: "Minor Pentatonic",
    kinitName: "Bati Minor",
    formula: "1-b3-4-5-b7",
    sessionCount: 1,
  },
  {
    slug: "scale-3",
    order: 3,
    code: "Scale 3",
    title: "Bati — Major, Minor & Lydian",
    kinitName: "Bati",
    formula: "1-3-4-5-7", // Bati Major; Minor and Lydian variants live on the module page
    sessionCount: 3, // Bati Major, Bati Minor, Bati Lydian
  },
  {
    slug: "scale-4",
    order: 4,
    code: "Scale 4",
    title: "Anchihoye & Anchihoye Dorian",
    kinitName: "Anchihoye",
    formula: "1-b2-4-b5-6",
    sessionCount: 2, // Anchihoye (Traditional), Anchihoye Dorian
  },
  {
    slug: "scale-5",
    order: 5,
    code: "Scale 5",
    title: "Mixolydian Pentatonic & Mixolydian Minor Pentatonic",
    kinitName: "Mixolydian Pentatonic",
    formula: "1-2-4-5-6",
    sessionCount: 2, // Mixolydian Pentatonic, Mixolydian Minor Pentatonic
  },
];

export const SCALE_GROUPS: ScaleGroupMeta[] = SCALE_GROUP_DEFS.map((def) => ({
  ...def,
  priceCents: def.sessionCount * PRICE_PER_SESSION_CENTS,
}));

export const SCALE_SLUGS = SCALE_GROUPS.map((s) => s.slug);

export const TOTAL_PAY_AS_YOU_GO_CENTS = SCALE_GROUPS.reduce((sum, s) => sum + s.priceCents, 0);

export const PRO_LIFETIME_PRICE_CENTS = 20000; // $200 — saves $50 vs. paying per session across all 6 chapters

export function scaleIndexFromSlug(slug: string): number {
  return SCALE_SLUGS.indexOf(slug);
}

export function scaleGroupBySlug(slug: string): ScaleGroupMeta | undefined {
  return SCALE_GROUPS.find((s) => s.slug === slug);
}
