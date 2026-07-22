import type { ChordQualityKey } from "@/lib/music-theory";

// Rich pedagogical content for the /scales/[slug] module page — kept
// separate from curriculum.ts (which only carries the single representative
// formula/price needed for cards, gating, and the DB seed). Several scale
// groups bundle more than one named variant in the book (Scale 3 covers
// Bati Major, Minor, and Lydian in one chapter/checklist), so this models
// each ScaleGroup as one or more named variants, each with its own formula
// and native chord list, grounded directly in the book's chord tables.

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
  "scale-0": [
    {
      name: "Diatonic (Major) Scale",
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
  "scale-1": [
    {
      name: "Major Pentatonic (Tizita Major)",
      formula: "1-2-3-5-6",
      nativeChords: [
        { degree: "1", quality: "major", label: "I" },
        { degree: "6", quality: "minor", label: "vi" },
        { degree: "6", quality: "minor7", label: "vi7" },
      ],
    },
  ],
  "scale-2": [
    {
      name: "Minor Pentatonic (Bati Minor)",
      formula: "1-b3-4-5-b7",
      nativeChords: [
        { degree: "1", quality: "minor", label: "i" },
        { degree: "1", quality: "minor7", label: "i7" },
        { degree: "b3", quality: "major", label: "bIII" },
      ],
    },
  ],
  "scale-3": [
    {
      name: "Bati Major",
      formula: "1-3-4-5-7",
      nativeChords: [
        { degree: "1", quality: "major", label: "I" },
        { degree: "1", quality: "major7", label: "Imaj7" },
        { degree: "3", quality: "minor", label: "iii" },
      ],
    },
    {
      name: "Bati Minor",
      formula: "1-b3-4-5-b7",
      nativeChords: [
        { degree: "1", quality: "minor", label: "i" },
        { degree: "1", quality: "minor7", label: "i7" },
        { degree: "b3", quality: "major", label: "bIII" },
      ],
    },
    {
      name: "Bati Lydian",
      formula: "1-3-#4-5-7",
      nativeChords: [
        { degree: "1", quality: "major", label: "I" },
        { degree: "1", quality: "major7", label: "Imaj7" },
        { degree: "3", quality: "minor", label: "iii" },
      ],
    },
  ],
  "scale-4": [
    {
      name: "Anchihoye (Traditional)",
      formula: "1-b2-4-b5-6",
      nativeChords: [
        { degree: "4", quality: "major", label: "IV" },
        { degree: "b5", quality: "minor", label: "bv" },
      ],
    },
    {
      name: "Anchihoye Dorian",
      formula: "1-b2-4-5-6",
      nativeChords: [{ degree: "4", quality: "major", label: "IV" }],
    },
  ],
  "scale-5": [
    {
      name: "Mixolydian Pentatonic",
      formula: "1-2-4-5-6",
      nativeChords: [
        { degree: "4", quality: "major", label: "IV" },
        { degree: "2", quality: "minor", label: "ii" },
        { degree: "2", quality: "minor7", label: "ii7" },
      ],
    },
    {
      name: "Mixolydian Minor Pentatonic",
      formula: "1-2-4-5-b6",
      nativeChords: [
        { degree: "4", quality: "minor", label: "iv" },
        { degree: "2", quality: "diminished", label: "ii°" },
        { degree: "2", quality: "halfDiminished7", label: "ii7♭5" },
      ],
    },
  ],
};
