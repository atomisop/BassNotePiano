/**
 * The daily finger exercises. All of these are standard, widely taught
 * patterns (five-finger positions, the C major scale fingering, the first
 * Hanon exercise, the guitar "spider" and its variations).
 * Fingering conventions: piano 1 = thumb through 5 = little finger; guitar
 * fretting hand 1 = index through 4 = little finger; guitar picking hand
 * T = thumb, I = index, M = middle, R = ring.
 */

export type Hand = "L" | "R";
export type Finger = 1 | 2 | 3 | 4 | 5;

export interface PianoStep {
  note: string;
  finger: Finger;
}

export interface PianoSection {
  hand: Hand;
  label: string;
  steps: PianoStep[];
}

export interface PianoExercise {
  id: string;
  title: string;
  summary: string;
  how: string[];
  bpm: number;
  sections: PianoSection[];
}

const s = (note: string, finger: Finger): PianoStep => ({ note, finger });

export const PIANO_EXERCISES: PianoExercise[] = [
  {
    id: "five-finger",
    title: "Five-finger position",
    summary: "Thumb on C, little finger on G. The base of everything.",
    how: [
      "Rest each finger on its own key: right hand 1 on C up to 5 on G, left hand 5 on C up to 1 on G.",
      "Play up and down slowly, one finger per key, with a relaxed, curved hand.",
      "Keep the wrist level. Each finger drops from the knuckle, the others stay still.",
    ],
    bpm: 60,
    sections: [
      { hand: "R", label: "Right hand, up and back", steps: [s("C", 1), s("D", 2), s("E", 3), s("F", 4), s("G", 5), s("F", 4), s("E", 3), s("D", 2), s("C", 1)] },
      { hand: "L", label: "Left hand, up and back", steps: [s("C", 5), s("D", 4), s("E", 3), s("F", 2), s("G", 1), s("F", 2), s("E", 3), s("D", 4), s("C", 5)] },
    ],
  },
  {
    id: "skips",
    title: "Skipping fingers",
    summary: "Thirds inside the five-finger position: 1-3, 2-4, 3-5.",
    how: [
      "Play the two notes of each pair one after the other, never together.",
      "Land each finger cleanly before the next one moves. No rushing the second note.",
      "Do the right hand, then the left, then both hands together once it is smooth.",
    ],
    bpm: 66,
    sections: [
      { hand: "R", label: "Right hand", steps: [s("C", 1), s("E", 3), s("D", 2), s("F", 4), s("E", 3), s("G", 5), s("E", 3), s("F", 4), s("D", 2), s("E", 3), s("C", 1)] },
      { hand: "L", label: "Left hand", steps: [s("C", 5), s("E", 3), s("D", 4), s("F", 2), s("E", 3), s("G", 1), s("E", 3), s("F", 2), s("D", 4), s("E", 3), s("C", 5)] },
    ],
  },
  {
    id: "c-scale",
    title: "C major scale, one octave",
    summary: "Thumb under, third finger over. The fingering for every major scale.",
    how: [
      "Right hand going up: 1 2 3, tuck the thumb under the 3rd finger, then 1 2 3 4 5.",
      "Left hand going up: 5 4 3 2 1, cross the 3rd finger over the thumb, then 3 2 1.",
      "Come back down the same way. Keep the hand quiet while the thumb tucks.",
    ],
    bpm: 72,
    sections: [
      { hand: "R", label: "Right hand, up", steps: [s("C", 1), s("D", 2), s("E", 3), s("F", 1), s("G", 2), s("A", 3), s("B", 4), s("C", 5)] },
      { hand: "L", label: "Left hand, up", steps: [s("C", 5), s("D", 4), s("E", 3), s("F", 2), s("G", 1), s("A", 3), s("B", 2), s("C", 1)] },
    ],
  },
  {
    id: "hanon-1",
    title: "Hanon No. 1 (C major)",
    summary: "The classic finger-strength pattern. Hands two octaves apart.",
    how: [
      "Right hand starts on middle C with finger 1, left hand two octaves lower with finger 5.",
      "Each group climbs with the stretch between the first two notes, then comes back down.",
      "Play it evenly and quietly. The same fingering is used in every key.",
    ],
    bpm: 60,
    sections: [
      {
        hand: "R",
        label: "Right hand, first two groups",
        steps: [s("C", 1), s("E", 2), s("F", 3), s("G", 4), s("A", 5), s("G", 4), s("F", 3), s("E", 2), s("D", 1), s("F", 2), s("G", 3), s("A", 4), s("B", 5), s("A", 4), s("G", 3), s("F", 2)],
      },
      {
        hand: "L",
        label: "Left hand, first two groups",
        steps: [s("C", 5), s("E", 4), s("F", 3), s("G", 2), s("A", 1), s("G", 2), s("F", 3), s("E", 4), s("D", 5), s("F", 4), s("G", 3), s("A", 2), s("B", 1), s("A", 2), s("G", 3), s("F", 4)],
      },
    ],
  },
  {
    id: "arpeggio",
    title: "C major arpeggio",
    summary: "Broken chord: C E G C. Teaches the hand to open and close.",
    how: [
      "Right hand: 1 2 3 5 going up, 5 3 2 1 coming down. Left hand: 5 3 2 1 going up, 1 2 3 5 down.",
      "Let the arm follow the hand across the keys. Do not twist the fingers to reach.",
      "Keep the notes even in length and volume.",
    ],
    bpm: 66,
    sections: [
      { hand: "R", label: "Right hand", steps: [s("C", 1), s("E", 2), s("G", 3), s("C", 5), s("G", 3), s("E", 2), s("C", 1)] },
      { hand: "L", label: "Left hand", steps: [s("C", 5), s("E", 3), s("G", 2), s("C", 1), s("G", 2), s("E", 3), s("C", 5)] },
    ],
  },
];


export interface GuitarStep {
  /** 1 = thinnest string, 6 = thickest. */
  string: number;
  fret: number;
  /** Fretting finger 1-4, 0 for an open string. */
  finger: 0 | 1 | 2 | 3 | 4;
  /** Pick direction: D = down, U = up. */
  pick?: "D" | "U";
  /** Picking-hand finger for fingerstyle: T thumb, I index, M middle, R ring. */
  pickFinger?: "T" | "I" | "M" | "R";
}

export interface GuitarExercise {
  id: string;
  title: string;
  summary: string;
  how: string[];
  bpm: number;
  steps: GuitarStep[];
  strings: 6;
}

const g = (string: number, fret: number, finger: GuitarStep["finger"], extra: Partial<GuitarStep> = {}): GuitarStep => ({ string, fret, finger, ...extra });
const alt = (i: number): "D" | "U" => (i % 2 === 0 ? "D" : "U");

export const GUITAR_EXERCISES: GuitarExercise[] = [
  {
    id: "spider",
    title: "Spider 1-2-3-4",
    summary: "One finger per fret across four frets. Repeat on every string.",
    how: [
      "Index on fret 5, middle on 6, ring on 7, pinky on 8, played one after another.",
      "Alternate pick: down, up, down, up. Then move to the next string and repeat the same shape.",
      "Keep each finger close to the fret wire and the wrist straight. Use a steady tempo.",
    ],
    bpm: 60,
    strings: 6,
    steps: [5, 6, 7, 8].map((fret, i) => g(6, fret, (i + 1) as 1 | 2 | 3 | 4, { pick: alt(i) })),
  },
  {
    id: "permutation",
    title: "Finger order 1-3-2-4",
    summary: "Same four frets, scrambled order, for finger independence.",
    how: [
      "Play fret 5 with 1, fret 7 with 3, fret 6 with 2, fret 8 with 4.",
      "Then try 1-2-4-3 and 4-2-3-1. The picking stays strictly down, up, down, up.",
      "If a finger lags, slow the metronome until all four notes ring evenly.",
    ],
    bpm: 56,
    strings: 6,
    steps: [
      g(6, 5, 1, { pick: "D" }),
      g(6, 7, 3, { pick: "U" }),
      g(6, 6, 2, { pick: "D" }),
      g(6, 8, 4, { pick: "U" }),
    ],
  },
  {
    id: "staircase",
    title: "String staircase",
    summary: "One finger per string, climbing across the neck.",
    how: [
      "Play fret 5 on the 6th string with 1, fret 6 on the 5th with 2, fret 7 on the 4th with 3, fret 8 on the 3rd with 4.",
      "Then come back down the same way. This trains the hand to move across strings.",
      "Alternate pick the whole time and keep the notes ringing evenly.",
    ],
    bpm: 56,
    strings: 6,
    steps: [g(6, 5, 1, { pick: "D" }), g(5, 6, 2, { pick: "U" }), g(4, 7, 3, { pick: "D" }), g(3, 8, 4, { pick: "U" }), g(3, 8, 4, { pick: "D" }), g(4, 7, 3, { pick: "U" }), g(5, 6, 2, { pick: "D" }), g(6, 5, 1, { pick: "U" })],
  },
  {
    id: "open-strings",
    title: "Alternate picking on open strings",
    summary: "Right-hand control: down, up, down, up on every string.",
    how: [
      "Pick each open string twice, down then up, from the 6th string to the 1st and back.",
      "Move from the wrist, not the whole arm. Keep the pick angle small.",
      "Count out loud with the metronome so the up-strokes are as even as the down-strokes.",
    ],
    bpm: 72,
    strings: 6,
    steps: [6, 5, 4, 3, 2, 1].flatMap((str) => [g(str, 0, 0, { pick: "D" }), g(str, 0, 0, { pick: "U" })]),
  },
  {
    id: "pima",
    title: "Fingerstyle T-I-M-R",
    summary: "Thumb, index, middle, ring on separate strings.",
    how: [
      "Thumb (T) plays the 5th string, index (I) the 3rd, middle (M) the 2nd, ring (R) the 1st.",
      "Rest the fingers on their strings first, then pluck and let each finger come back to rest.",
      "Go up T-I-M-R, then back down R-M-I-T. Keep the hand still and the notes even.",
    ],
    bpm: 60,
    strings: 6,
    steps: [
      g(5, 0, 0, { pickFinger: "T" }),
      g(3, 0, 0, { pickFinger: "I" }),
      g(2, 0, 0, { pickFinger: "M" }),
      g(1, 0, 0, { pickFinger: "R" }),
      g(2, 0, 0, { pickFinger: "M" }),
      g(3, 0, 0, { pickFinger: "I" }),
    ],
  },
];
