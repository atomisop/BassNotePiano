/** Note math for the on-screen piano. MIDI note numbers: 60 is middle C (C4), 69 is A4 = 440 Hz. */

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const BLACK = new Set([1, 3, 6, 8, 10]);

export const MIDI_MIN = 21; // A0
export const MIDI_MAX = 108; // C8

export function isValidMidi(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIDI_MIN && value <= MIDI_MAX;
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** "C4", "F#3". Sharps only, so the label is the same everywhere. */
export function midiToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NAMES[((midi % 12) + 12) % 12]}${octave}`;
}

export function isBlackKey(midi: number): boolean {
  return BLACK.has(((midi % 12) + 12) % 12);
}

export interface PianoKey {
  midi: number;
  name: string;
  isBlack: boolean;
  /** Number of white keys before this one, so a black key can be placed between two whites. */
  whiteIndex: number;
}

export function buildKeys(startMidi: number, endMidi: number): PianoKey[] {
  if (!isValidMidi(startMidi) || !isValidMidi(endMidi) || endMidi < startMidi) throw new RangeError("Invalid key range");
  const keys: PianoKey[] = [];
  let whites = 0;
  for (let midi = startMidi; midi <= endMidi; midi++) {
    const black = isBlackKey(midi);
    keys.push({ midi, name: midiToName(midi), isBlack: black, whiteIndex: whites });
    if (!black) whites++;
  }
  return keys;
}

export function countWhiteKeys(keys: PianoKey[]): number {
  return keys.filter((k) => !k.isBlack).length;
}

/**
 * Computer keyboard layout: the home row plays the white keys and the row above the black ones, starting at the range's first C.
 * Returns the MIDI note for a `KeyboardEvent.key`, or null when the key plays nothing.
 */
const KEY_OFFSETS: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14,
};
export function keyboardKeyToMidi(key: string, baseMidi: number): number | null {
  const offset = KEY_OFFSETS[key.toLowerCase()];
  if (offset === undefined) return null;
  const midi = baseMidi + offset;
  return isValidMidi(midi) ? midi : null;
}
