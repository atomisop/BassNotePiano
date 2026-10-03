// ============================================================================
// Transposition engine for the Ethiopian Scales, Rhythm & Chords curriculum.
//
// Two distinct sources of truth, deliberately kept separate:
//
//  1. Scale/chord degree spelling (spellDegree, spellScale, buildChordOnDegree)
//     is fully algorithmic — it implements the book's own stated rule
//     ("a b3/b5/b7/b9 is always written as a flatted letter, never its sharp
//     enharmonic twin; a #4/#5/#9 is always written sharp"). This is what
//     drives every scale table and chord table in the book (Scale 1-5
//     formulas, the Chord Types Reference, native chord tables), and it
//     generalizes to any future scale/chord formula without new data.
//
//  2. The plain chromatic scale (Scale 0's foundation table) is NOT spelled
//     by one uniform rule in the book — different roots mix "raise the
//     lower neighbor" and "flat the upper neighbor" passing tones to avoid
//     awkward spellings (e.g. F's chromatic scale uses b2/b3 early, #4 in
//     the middle, then b6/b7). That's curated reference data, not a
//     formula, so it's hardcoded here verbatim from the book instead of
//     reverse-engineered.
// ============================================================================

const NATURAL_LETTER_SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;

const SIMPLE_SHARP_NAMES: Record<number, string> = {
  0: "C", 1: "C#", 2: "D", 3: "D#", 4: "E", 5: "F",
  6: "F#", 7: "G", 8: "G#", 9: "A", 10: "A#", 11: "B",
};

const SIMPLE_FLAT_NAMES: Record<number, string> = {
  0: "C", 1: "Db", 2: "D", 3: "Eb", 4: "E", 5: "F",
  6: "Gb", 7: "G", 8: "Ab", 9: "A", 10: "Bb", 11: "B",
};

// The 12 root keys used throughout the curriculum book, spelled exactly as
// the book prints them (F# not Gb, Db not C#) — this is the set every
// scale/chord table iterates over, and the recommended dropdown for root
// selection in the Transposition Dashboard.
export const ROOT_KEYS = [
  "C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F",
] as const;
export type RootKey = (typeof ROOT_KEYS)[number];

// ---------------------------------------------------------------------------
// Note parsing
// ---------------------------------------------------------------------------

function parseNote(note: string): { letter: string; semitone: number } {
  const letter = note[0];
  const accidentals = note.slice(1); // "", "#", "b", "##", "bb"
  if (!(letter in NATURAL_LETTER_SEMITONES)) {
    throw new Error(`Unrecognized note letter: "${note}"`);
  }
  const delta = accidentals
    .split("")
    .reduce((sum, ch) => sum + (ch === "#" ? 1 : ch === "b" ? -1 : 0), 0);
  const semitone = (((NATURAL_LETTER_SEMITONES[letter] + delta) % 12) + 12) % 12;
  return { letter, semitone };
}

/**
 * The pitch class (0-11, C = 0) a spelled note sounds at.
 *
 * Spelling and sound are deliberately different things in this file — the
 * whole point of spellDegree is that Gb and F# are different *names*. This is
 * the one place that collapses that distinction, because a loudspeaker cannot
 * tell them apart. Exported for the audio engine (src/lib/audio-engine.ts),
 * which needs a frequency for a name this module produced; nothing about
 * scale or chord spelling should ever route through it.
 */
export function pitchClassOf(note: string): number {
  return parseNote(note).semitone;
}

// Major-scale semitone offsets for unaltered degrees 1-7. Extended chord
// degrees (9, 11, 13) fold back onto 2, 4, 6 — a 9th is a 2nd an octave up.
const DEGREE_OFFSETS: Record<number, number> = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };

function parseDegreeToken(token: string): { number: number; accidental: number } {
  const match = token.trim().match(/^(b{1,2}|#{1,2})?(\d{1,2})$/);
  if (!match) throw new Error(`Unrecognized scale-degree token: "${token}"`);
  const [, accidentalStr, numStr] = match;
  const accidental = !accidentalStr ? 0 : accidentalStr[0] === "b" ? -accidentalStr.length : accidentalStr.length;
  return { number: Number(numStr), accidental };
}

function applyAccidental(letter: string, accidental: number): string {
  if (accidental === 0) return letter;
  if (accidental === 1) return `${letter}#`;
  if (accidental === -1) return `${letter}b`;
  // Double sharps/flats surface on a few remote transposed degrees (the 7th
  // of G# harmonic minor is F##). The lesson PDFs print them as written
  // (F##, C##), so the spelling engine does too. Anything past a double
  // accidental has no standard written form here, so it falls back to the
  // plain enharmonic name.
  if (accidental === 2) return `${letter}##`;
  if (accidental === -2) return `${letter}bb`;
  const pitchClass = (((NATURAL_LETTER_SEMITONES[letter] + accidental) % 12) + 12) % 12;
  return accidental > 0 ? SIMPLE_SHARP_NAMES[pitchClass] : SIMPLE_FLAT_NAMES[pitchClass];
}

// ---------------------------------------------------------------------------
// Scale degree spelling
// ---------------------------------------------------------------------------

/**
 * Spells a single scale degree (e.g. "1", "b3", "#4", "b7", "9") from a
 * given root, following the book's always-flat / always-sharp spelling rule.
 */
export function spellDegree(root: string, degreeToken: string): string {
  const { letter: rootLetter, semitone: rootSemitone } = parseNote(root);
  const { number, accidental } = parseDegreeToken(degreeToken);

  const rootLetterIndex = LETTERS.indexOf(rootLetter as (typeof LETTERS)[number]);
  const foldedDegree = ((number - 1) % 7) + 1; // 9 -> 2, 11 -> 4, 13 -> 6
  const targetLetter = LETTERS[(rootLetterIndex + foldedDegree - 1) % 7];

  const targetSemitone = (((rootSemitone + DEGREE_OFFSETS[foldedDegree] + accidental) % 12) + 12) % 12;
  const naturalSemitone = NATURAL_LETTER_SEMITONES[targetLetter];

  // Normalize into [-6, 5] so wraparound pairs (e.g. B -> C) resolve to a
  // small accidental instead of e.g. -11.
  const neededAccidental = (((targetSemitone - naturalSemitone + 6) % 12) + 12) % 12 - 6;

  return applyAccidental(targetLetter, neededAccidental);
}

export interface SpelledScale {
  root: string;
  degrees: string[];
  notes: string[];
}

/** Spells every degree of a "-"-separated formula (e.g. "1-b3-4-5-b7") from a root. */
export function spellScale(root: string, formula: string): SpelledScale {
  const degrees = formula.split("-").map((d) => d.trim());
  // The chromatic scale is named by its intervals (minor 2nd, tritone...) but
  // its notes are written with the PDF's convention: sharps going up. Only the
  // note names change, never which keys sound.
  const noteDegrees = formula === CHROMATIC_FORMULA ? CHROMATIC_ASCENDING_DEGREES : degrees;
  return { root, degrees, notes: noteDegrees.map((degree) => spellDegree(root, degree)) };
}

/** The chromatic scale's interval formula, as shown to students. */
export const CHROMATIC_FORMULA = "1-b2-2-b3-3-4-b5-5-b6-6-b7-7";
/** Ascending chromatic notes use sharps; descending uses flats (lesson PDF). */
const CHROMATIC_ASCENDING_DEGREES = ["1", "#1", "2", "#2", "3", "4", "#4", "5", "#5", "6", "#6", "7"];
export const CHROMATIC_DESCENDING_DEGREES = ["1", "7", "b7", "6", "b6", "5", "b5", "4", "3", "b3", "2", "b2"];

/** Spells a formula across all 12 curriculum keys — powers the Transposition Dashboard. */
export function getScaleInAllKeys(formula: string): Record<RootKey, string[]> {
  return Object.fromEntries(
    ROOT_KEYS.map((root) => [root, spellScale(root, formula).notes]),
  ) as Record<RootKey, string[]>;
}

// ---------------------------------------------------------------------------
// Chords — native triads/sevenths built on a scale degree
// ---------------------------------------------------------------------------

export const CHORD_QUALITIES = {
  major: { symbol: "", formula: "1-3-5" },
  minor: { symbol: "m", formula: "1-b3-5" },
  diminished: { symbol: "dim", formula: "1-b3-b5" },
  augmented: { symbol: "aug", formula: "1-3-#5" },
  dominant7: { symbol: "7", formula: "1-3-5-b7" },
  major7: { symbol: "maj7", formula: "1-3-5-7" },
  minor7: { symbol: "m7", formula: "1-b3-5-b7" },
  halfDiminished7: { symbol: "m7b5", formula: "1-b3-b5-b7" },
  major9: { symbol: "maj9", formula: "1-3-5-7-9" },
  minor9: { symbol: "m9", formula: "1-b3-5-b7-9" },
  add9: { symbol: "add9", formula: "1-3-5-9" },
  minor11: { symbol: "m11", formula: "1-b3-5-b7-9-11" },
  thirteenth: { symbol: "13", formula: "1-3-5-b7-9-13" },
  altered7sharp9: { symbol: "7#9", formula: "1-3-b7-#9" },
  sus4: { symbol: "sus4", formula: "1-4-5" },
} as const satisfies Record<string, { symbol: string; formula: string }>;

export type ChordQualityKey = keyof typeof CHORD_QUALITIES;

export interface NativeChord {
  degree: string; // the scale degree the chord is built on, e.g. "6", "b3"
  quality: ChordQualityKey;
  rootNote: string; // spelled chord root, e.g. "F#"
  symbol: string; // e.g. "F#m7"
  notes: string[];
}

/**
 * Builds the chord rooted on a given scale degree (e.g. the vi minor of a
 * major pentatonic scale). `scaleRoot` is the scale's own root — the
 * degree token locates the chord's root note within that scale, and the
 * chord's own tones are then spelled from that note.
 */
export function buildChordOnDegree(
  scaleRoot: string,
  degreeToken: string,
  quality: ChordQualityKey,
): NativeChord {
  const rootNote = spellDegree(scaleRoot, degreeToken);
  const { symbol, formula } = CHORD_QUALITIES[quality];
  const notes = spellScale(rootNote, formula).notes;
  return { degree: degreeToken, quality, rootNote, symbol: `${rootNote}${symbol}`, notes };
}

/** Builds the same native chord across all 12 curriculum keys. */
export function getChordInAllKeys(
  degreeToken: string,
  quality: ChordQualityKey,
): Record<RootKey, NativeChord> {
  return Object.fromEntries(
    ROOT_KEYS.map((root) => [root, buildChordOnDegree(root, degreeToken, quality)]),
  ) as Record<RootKey, NativeChord>;
}

// ---------------------------------------------------------------------------
// Chromatic scale — curated reference data (see file header)
// ---------------------------------------------------------------------------

export const CHROMATIC_SCALES: Record<RootKey, string[]> = {
  C: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  G: ["G", "G#", "A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#"],
  D: ["D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "C", "C#"],
  A: ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"],
  E: ["E", "F", "F#", "G", "G#", "A", "A#", "B", "C", "C#", "D", "D#"],
  B: ["B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#"],
  "F#": ["F#", "G", "G#", "A", "A#", "B", "C", "C#", "D", "D#", "E", "F"],
  Db: ["Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B", "C"],
  Ab: ["Ab", "A", "Bb", "B", "C", "Db", "D", "Eb", "E", "F", "Gb", "G"],
  Eb: ["Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B", "C", "Db", "D"],
  Bb: ["Bb", "B", "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A"],
  F: ["F", "Gb", "G", "Ab", "A", "Bb", "B", "C", "Db", "D", "Eb", "E"],
};
