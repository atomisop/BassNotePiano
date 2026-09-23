import type { ChordQualityKey } from "@/lib/music-theory";

// Rich pedagogical content for the /scales/[slug] module page — kept
// separate from curriculum.ts (which only carries the single representative
// formula/price needed for cards, gating, and the DB seed). Every scale is
// now standalone (one ScaleGroup, one variant) — the array shape is kept
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
      formula: "1-b2-4-b5-6",
      nativeChords: [
        { degree: "1", quality: "diminished", label: "i°" },
        { degree: "b2", quality: "augmented", label: "bII+" },
        { degree: "4", quality: "major", label: "IV" },
        { degree: "b5", quality: "minor", label: "bvm" },
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
