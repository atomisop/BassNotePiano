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
    slug: "scale-0",
    order: 0,
    code: "Scale 0",
    title: "Diatonic Scale, Chromatic Scale & the Seven Modes",
    kinitName: null,
    formula: "1-2-3-4-5-6-7", // W-W-H-W-W-W-H
  },
  {
    slug: "scale-1",
    order: 1,
    code: "Scale 1",
    title: "Major Pentatonic",
    kinitName: "Tizita Major (Full Tizita)",
    formula: "1-2-3-5-6",
  },
  {
    slug: "scale-2",
    order: 2,
    code: "Scale 2",
    title: "Minor Pentatonic",
    kinitName: "Bati Minor",
    formula: "1-b3-4-5-b7",
  },
  {
    slug: "scale-3",
    order: 3,
    code: "Scale 3",
    title: "Bati — Major, Minor & Lydian",
    kinitName: "Bati",
    formula: "1-3-4-5-7", // Bati Major; Minor and Lydian variants live on the module page
  },
  {
    slug: "scale-4",
    order: 4,
    code: "Scale 4",
    title: "Anchihoye & Anchihoye Dorian",
    kinitName: "Anchihoye",
    formula: "1-b2-4-b5-6",
  },
  {
    slug: "scale-5",
    order: 5,
    code: "Scale 5",
    title: "Mixolydian Pentatonic & Mixolydian Minor Pentatonic",
    kinitName: "Mixolydian Pentatonic",
    formula: "1-2-4-5-6",
  },
];

export const SCALE_SLUGS = SCALE_GROUPS.map((s) => s.slug);

/** One-time purchase price for lifetime access to every scale group above. */
export const CURRICULUM_PRICE_CENTS = 6999;

export function scaleIndexFromSlug(slug: string): number {
  return SCALE_SLUGS.indexOf(slug);
}

export function scaleGroupBySlug(slug: string): ScaleGroupMeta | undefined {
  return SCALE_GROUPS.find((s) => s.slug === slug);
}
