import { ROOT_KEYS, spellScale, type ChordQualityKey, type RootKey } from "@/lib/music-theory";

// Rich pedagogical content for the /scales/[slug] module page, kept
// separate from curriculum.ts (which only carries the single representative
// formula/price needed for cards, gating, and the DB seed). Every scale is
// now standalone (one ScaleGroup, one variant), the array shape is kept
// only so existing consumers that loop over SCALE_CONTENT[slug] don't need
// to change how they read it, even though it now always holds exactly one
// entry.

export interface NativeChordSpec {
  degree: string; // scale-degree token the chord's root sits on, e.g. "1", "b3"
  quality: ChordQualityKey;
  /** Roman-numeral-style display label, e.g. "I", "vi", "bIII", "vii°". */
  label: string;
}

export interface ScaleVariant {
  name: string;
  formula: string;
  nativeChords: NativeChordSpec[];
  /**
   * Some scales are spelled differently in a few keys (Anchihoye is written
   * with C# and F# in most keys, but E, B and F# switch to Db/Gb-style
   * spelling to avoid E# and B#). In `roots`, each degree token in `tokens`
   * is replaced before spelling. Which keys sound is never affected.
   */
  alternateSpelling?: { roots: RootKey[]; tokens: Record<string, string> };
  /** Spell chord tones with the scale's own note names where they coincide. */
  chordSpelling?: "scale";
}

/** The degree token to spell for `root`, honoring the variant's alternate spelling. */
export function tokenForRoot(variant: ScaleVariant, token: string, root: string): string {
  const alt = variant.alternateSpelling;
  return alt && (alt.roots as string[]).includes(root) ? (alt.tokens[token] ?? token) : token;
}

/** The variant's formula as spelled in `root`. */
export function formulaForRoot(variant: ScaleVariant, root: string): string {
  return variant.formula
    .split("-")
    .map((t) => tokenForRoot(variant, t, root))
    .join("-");
}

/** The scale's notes in every curriculum key, with per-key spelling applied. */
export function variantInAllKeys(variant: ScaleVariant): Record<RootKey, string[]> {
  return Object.fromEntries(
    ROOT_KEYS.map((root) => [root, spellScale(root, formulaForRoot(variant, root)).notes]),
  ) as Record<RootKey, string[]>;
}

export const SCALE_CONTENT: Record<string, ScaleVariant[]> = {
  "major-scale": [
    {
      name: "The Major Scale and the Seven Modes",
      formula: "1-2-3-4-5-6-7",
      nativeChords: [
        { degree: "1", quality: "major", label: "I" },
        { degree: "2", quality: "minor", label: "ii" },
        { degree: "3", quality: "minor", label: "iii" },
        { degree: "4", quality: "major", label: "IV" },
        { degree: "5", quality: "major", label: "V" },
        { degree: "6", quality: "minor", label: "vi" },
        { degree: "7", quality: "diminished", label: "vii°" },
      ],
    },
  ],
  "natural-minor": [
    {
      name: "The Natural Minor Scale",
      formula: "1-2-b3-4-5-b6-b7",
      nativeChords: [
        { degree: "1", quality: "minor", label: "i" },
        { degree: "2", quality: "diminished", label: "ii°" },
        { degree: "b3", quality: "major", label: "bIII" },
        { degree: "4", quality: "minor", label: "iv" },
        { degree: "5", quality: "minor", label: "v" },
        { degree: "b6", quality: "major", label: "bVI" },
        { degree: "b7", quality: "major", label: "bVII" },
      ],
    },
  ],
  "harmonic-minor": [
    {
      name: "The Harmonic Minor Scale",
      formula: "1-2-b3-4-5-b6-7",
      nativeChords: [
        { degree: "1", quality: "minor", label: "i" },
        { degree: "2", quality: "diminished", label: "ii°" },
        { degree: "b3", quality: "augmented", label: "bIII+" },
        { degree: "4", quality: "minor", label: "iv" },
        { degree: "5", quality: "major", label: "V" },
        { degree: "b6", quality: "major", label: "bVI" },
        { degree: "7", quality: "diminished", label: "vii°" },
      ],
    },
  ],
  "melodic-minor": [
    {
      name: "The Melodic Minor Scale",
      formula: "1-2-b3-4-5-6-7",
      nativeChords: [
        { degree: "1", quality: "minor", label: "i" },
        { degree: "2", quality: "minor", label: "ii" },
        { degree: "b3", quality: "augmented", label: "bIII+" },
        { degree: "4", quality: "major", label: "IV" },
        { degree: "5", quality: "major", label: "V" },
        { degree: "6", quality: "diminished", label: "vi°" },
        { degree: "7", quality: "diminished", label: "vii°" },
      ],
    },
  ],
  "parallel-minor": [
    {
      name: "Parallel Minor",
      formula: "1-2-b3-4-5-b6-b7",
      nativeChords: [
        { degree: "1", quality: "minor", label: "i" },
        { degree: "2", quality: "diminished", label: "ii°" },
        { degree: "b3", quality: "major", label: "bIII" },
        { degree: "4", quality: "minor", label: "iv" },
        { degree: "5", quality: "minor", label: "v" },
        { degree: "b6", quality: "major", label: "bVI" },
        { degree: "b7", quality: "major", label: "bVII" },
      ],
    },
  ],
  "chromatic-scale": [
    {
      name: "The Chromatic Scale",
      formula: "1-b2-2-b3-3-4-b5-5-b6-6-b7-7",
      nativeChords: [
        { degree: "1", quality: "major", label: "C" },
        { degree: "1", quality: "minor", label: "Cm" },
        { degree: "1", quality: "diminished", label: "C°" },
        { degree: "1", quality: "augmented", label: "C+" },
      ],
    },
  ],
  "tizita-major": [
    {
      name: "Major Pentatonic",
      formula: "1-2-3-5-6",
      nativeChords: [
        { degree: "1", quality: "major", label: "I" },
        { degree: "2", quality: "minor", label: "ii" },
        { degree: "3", quality: "minor", label: "iii" },
        { degree: "5", quality: "major", label: "V" },
        { degree: "6", quality: "minor", label: "vi" },
      ],
    },
  ],
  "tizita-minor": [
    {
      name: "Minor Pentatonic (Tizita)",
      formula: "1-2-b3-5-b6",
      nativeChords: [
        { degree: "1", quality: "minor", label: "i" },
        { degree: "2", quality: "diminished", label: "ii°" },
        { degree: "b3", quality: "major", label: "III" },
        { degree: "5", quality: "minor", label: "v" },
        { degree: "b6", quality: "major", label: "VI" },
      ],
    },
  ],
  "bati-major": [
    {
      name: "Bati Major",
      formula: "1-3-4-5-7",
      nativeChords: [
        { degree: "1", quality: "major", label: "I" },
        { degree: "3", quality: "minor", label: "iii" },
        { degree: "4", quality: "major", label: "IV" },
        { degree: "5", quality: "major", label: "V" },
        { degree: "7", quality: "diminished", label: "vii°" },
      ],
    },
  ],
  "bati-minor": [
    {
      name: "Bati Minor",
      formula: "1-b3-4-5-b7",
      nativeChords: [
        { degree: "1", quality: "minor", label: "i" },
        { degree: "b3", quality: "major", label: "III" },
        { degree: "4", quality: "minor", label: "iv" },
        { degree: "5", quality: "minor", label: "v" },
        { degree: "b7", quality: "major", label: "VII" },
      ],
    },
  ],
  "bati-lydian": [
    {
      name: "Bati Lydian",
      formula: "1-3-#4-5-7",
      nativeChords: [
        { degree: "1", quality: "major", label: "I" },
        { degree: "3", quality: "minor", label: "iii" },
        { degree: "#4", quality: "diminished", label: "#iv°" },
        { degree: "5", quality: "major", label: "V" },
        { degree: "7", quality: "sus4", label: "VIIsus4" },
      ],
    },
  ],
  "ambassel-major": [
    {
      name: "Ambassel Major",
      formula: "1-2-4-5-6",
      nativeChords: [
        { degree: "1", quality: "major", label: "I" },
        { degree: "2", quality: "minor", label: "ii" },
        { degree: "4", quality: "major", label: "IV" },
        { degree: "5", quality: "minor", label: "v" },
        { degree: "6", quality: "minor", label: "vi" },
      ],
    },
  ],
  "ambassel-minor": [
    {
      name: "Ambassel Minor",
      formula: "1-b2-4-5-b6",
      nativeChords: [
        { degree: "1", quality: "sus4", label: "Isus4" },
        { degree: "b2", quality: "major", label: "bII" },
        { degree: "4", quality: "minor", label: "iv" },
        { degree: "5", quality: "diminished", label: "v°" },
        { degree: "b6", quality: "major", label: "bVI" },
      ],
    },
  ],
  anchihoye: [
    {
      name: "Anchihoye",
      // Written #1 and #4 as in the lesson PDF; E, B and F# use the b2/b5
      // spelling instead (the PDF's "Spelling used" column).
      formula: "1-#1-4-#4-6",
      alternateSpelling: { roots: ["E", "B", "F#"], tokens: { "#1": "b2", "#4": "b5" } },
      chordSpelling: "scale",
      nativeChords: [
        { degree: "1", quality: "diminished", label: "i°" },
        { degree: "#1", quality: "augmented", label: "#I+" },
        { degree: "4", quality: "major", label: "IV" },
        { degree: "#4", quality: "minor", label: "#iv" },
        { degree: "6", quality: "augmented", label: "VI+" },
      ],
    },
  ],
  "anchihoye-dorian": [
    {
      name: "Anchihoye Dorian",
      formula: "1-2-4-5-b7",
      nativeChords: [
        { degree: "1", quality: "minor", label: "i" },
        { degree: "2", quality: "minor", label: "ii" },
        { degree: "4", quality: "major", label: "IV" },
        { degree: "5", quality: "minor", label: "v" },
        { degree: "b7", quality: "major", label: "bVII" },
      ],
    },
  ],
};

/**
 * Variants a single lesson can show on the virtual instrument, keyed by
 * scale group slug and then by the lesson's exact title. The Major Scale
 * group holds the seven modes as separate lessons, each with its own
 * formula (Dorian is 1-2-b3-4-5-6-b7, not the major scale's), so the
 * instrument, chart and chords must follow the lesson that is open.
 * Kept apart from SCALE_CONTENT on purpose: the quiz reads SCALE_CONTENT,
 * and adding seven modes there would change what the Major Scale quiz asks.
 * Formulas and chords are the ones printed in each mode's lesson PDF.
 */
export const LESSON_VARIANTS: Record<string, Record<string, ScaleVariant>> = {
  "major-scale": {
    "Mode 1: Ionian": {
      name: "Ionian",
      formula: "1-2-3-4-5-6-7",
      nativeChords: [
        { degree: "1", quality: "major", label: "I" },
        { degree: "2", quality: "minor", label: "ii" },
        { degree: "3", quality: "minor", label: "iii" },
        { degree: "4", quality: "major", label: "IV" },
        { degree: "5", quality: "major", label: "V" },
        { degree: "6", quality: "minor", label: "vi" },
        { degree: "7", quality: "diminished", label: "vii°" },
      ],
    },
    "Mode 2: Dorian": {
      name: "Dorian",
      formula: "1-2-b3-4-5-6-b7",
      nativeChords: [
        { degree: "1", quality: "minor", label: "i" },
        { degree: "2", quality: "minor", label: "ii" },
        { degree: "b3", quality: "major", label: "bIII" },
        { degree: "4", quality: "major", label: "IV" },
        { degree: "5", quality: "minor", label: "v" },
        { degree: "6", quality: "diminished", label: "vi°" },
        { degree: "b7", quality: "major", label: "bVII" },
      ],
    },
    "Mode 3: Phrygian": {
      name: "Phrygian",
      formula: "1-b2-b3-4-5-b6-b7",
      nativeChords: [
        { degree: "1", quality: "minor", label: "i" },
        { degree: "b2", quality: "major", label: "bII" },
        { degree: "b3", quality: "major", label: "bIII" },
        { degree: "4", quality: "minor", label: "iv" },
        { degree: "5", quality: "diminished", label: "v°" },
        { degree: "b6", quality: "major", label: "bVI" },
        { degree: "b7", quality: "minor", label: "bvii" },
      ],
    },
    "Mode 4: Lydian": {
      name: "Lydian",
      formula: "1-2-3-#4-5-6-7",
      nativeChords: [
        { degree: "1", quality: "major", label: "I" },
        { degree: "2", quality: "major", label: "II" },
        { degree: "3", quality: "minor", label: "iii" },
        { degree: "#4", quality: "diminished", label: "#iv°" },
        { degree: "5", quality: "major", label: "V" },
        { degree: "6", quality: "minor", label: "vi" },
        { degree: "7", quality: "minor", label: "vii" },
      ],
    },
    "Mode 5: Mixolydian": {
      name: "Mixolydian",
      formula: "1-2-3-4-5-6-b7",
      nativeChords: [
        { degree: "1", quality: "major", label: "I" },
        { degree: "2", quality: "minor", label: "ii" },
        { degree: "3", quality: "diminished", label: "iii°" },
        { degree: "4", quality: "major", label: "IV" },
        { degree: "5", quality: "minor", label: "v" },
        { degree: "6", quality: "minor", label: "vi" },
        { degree: "b7", quality: "major", label: "bVII" },
      ],
    },
    "Mode 6: Aeolian": {
      name: "Aeolian",
      formula: "1-2-b3-4-5-b6-b7",
      nativeChords: [
        { degree: "1", quality: "minor", label: "i" },
        { degree: "2", quality: "diminished", label: "ii°" },
        { degree: "b3", quality: "major", label: "bIII" },
        { degree: "4", quality: "minor", label: "iv" },
        { degree: "5", quality: "minor", label: "v" },
        { degree: "b6", quality: "major", label: "bVI" },
        { degree: "b7", quality: "major", label: "bVII" },
      ],
    },
    "Mode 7: Locrian": {
      name: "Locrian",
      formula: "1-b2-b3-4-b5-b6-b7",
      nativeChords: [
        { degree: "1", quality: "diminished", label: "i°" },
        { degree: "b2", quality: "major", label: "bII" },
        { degree: "b3", quality: "minor", label: "biii" },
        { degree: "4", quality: "minor", label: "iv" },
        { degree: "b5", quality: "major", label: "bV" },
        { degree: "b6", quality: "major", label: "bVI" },
        { degree: "b7", quality: "minor", label: "bvii" },
      ],
    },
  },
};
