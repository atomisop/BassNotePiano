"use client";

import { useMemo } from "react";
import { notesToAscendingMidi } from "@/lib/audio-engine";

/**
 * A playable keyboard showing where a spelled scale physically sits.
 *
 * The Scale Explorer could already spell a scale and sound it; this is the
 * third view of the same data — where the notes actually are under the hands.
 * That matters most for the kiñits with awkward spellings: Anchihoye's b2 and
 * b5 read as abstract tokens in a table, but as an unmistakable shape on keys.
 *
 * Written from scratch rather than adapted from a component library — the
 * catalogues only carry *computer* keyboards.
 *
 * ## Layout
 *
 * White keys are laid out in a row and black keys are absolutely positioned
 * over the seams between them. That's the only honest way to do it: a piano
 * octave has 7 white keys and 5 black ones sitting at irregular intervals
 * (there is no black key between E–F or B–C), so a uniform 12-column grid
 * would draw an instrument that doesn't exist.
 */

/** Semitone offsets of the white keys within an octave: C D E F G A B. */
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];

/**
 * Black keys, as: semitone offset, and which white key it sits after.
 * C#=after white 0, D#=after 1, F#=after 3, G#=after 4, A#=after 5.
 */
const BLACK_KEYS: { offset: number; afterWhite: number }[] = [
  { offset: 1, afterWhite: 0 },
  { offset: 3, afterWhite: 1 },
  { offset: 6, afterWhite: 3 },
  { offset: 8, afterWhite: 4 },
  { offset: 10, afterWhite: 5 },
];

const PITCH_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

export interface PianoKeyboardProps {
  /** Scale note names, already spelled (e.g. ["Db","Fb","Gb","Ab","Cb"]). */
  notes: string[];
  /** Degree tokens matching `notes`, e.g. ["1","b3","4","5","b7"]. */
  degrees: string[];
  /** Index of the note currently sounding, or null. */
  activeIndex: number | null;
  /**
   * Fired with the pressed key's own MIDI number, plus which scale degree it
   * represents (null when the key isn't in the scale). The pitch must come
   * from the MIDI, not the degree — the root occupies two different keys.
   */
  onPlayKey: (midi: number, degreeIndex: number | null) => void;
  disabled?: boolean;
}

export function PianoKeyboard({
  notes,
  degrees,
  activeIndex,
  onPlayKey,
  disabled,
}: PianoKeyboardProps) {
  const { startMidi, octaveCount, degreeByMidi } = useMemo(() => {
    const scaleMidis = notesToAscendingMidi(notes);
    if (scaleMidis.length === 0) {
      return { startMidi: 60, octaveCount: 2, degreeByMidi: new Map<number, number>() };
    }

    // Start at the C at or below the lowest scale note, so the keyboard always
    // begins at a visual octave boundary rather than mid-octave.
    const lowest = Math.min(...scaleMidis);
    const start = Math.floor(lowest / 12) * 12;

    // Enough octaves to contain the scale plus its closing root an octave up.
    const highest = Math.max(...scaleMidis) + 12;
    const octaves = Math.max(2, Math.ceil((highest - start + 1) / 12));

    // Which scale degree (by index) each sounding pitch belongs to. Keyed on
    // MIDI rather than note name because the keyboard is a physical object:
    // Fb and E are the same key, and the highlight has to land on it.
    const map = new Map<number, number>();
    scaleMidis.forEach((midi, i) => map.set(midi, i));
    // The run also closes on the root an octave up; light that key too.
    map.set(scaleMidis[0] + 12, 0);

    return { startMidi: start, octaveCount: octaves, degreeByMidi: map };
  }, [notes]);

  const whiteKeys: { midi: number; degreeIndex: number | undefined }[] = [];
  for (let o = 0; o < octaveCount; o++) {
    for (const offset of WHITE_OFFSETS) {
      const midi = startMidi + o * 12 + offset;
      whiteKeys.push({ midi, degreeIndex: degreeByMidi.get(midi) });
    }
  }

  const whiteCount = whiteKeys.length;

  function handlePress(midi: number, degreeIndex: number | undefined) {
    if (disabled) return;
    onPlayKey(midi, degreeIndex ?? null);
  }

  function labelFor(midi: number, degreeIndex: number | undefined) {
    const pitch = PITCH_NAMES[((midi % 12) + 12) % 12];
    if (degreeIndex === undefined) return `${pitch}, not in this scale`;
    return `${notes[degreeIndex]}, scale degree ${degrees[degreeIndex]}`;
  }

  return (
    <div>
      {/* Horizontal scroll rather than shrinking the keys: below roughly
          320px a two-octave keyboard gives each white key under 20px, which
          is narrower than a fingertip. Scrolling keeps them playable. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div
          className="relative mx-auto select-none"
          style={{ minWidth: `${whiteCount * 34}px`, height: 132 }}
          role="group"
          aria-label="Piano keyboard — scale notes are highlighted"
        >
          {/* ---- White keys ---- */}
          <div className="absolute inset-0 flex">
            {whiteKeys.map(({ midi, degreeIndex }) => {
              const inScale = degreeIndex !== undefined;
              const isActive =
                inScale &&
                (activeIndex === degreeIndex ||
                  (activeIndex === notes.length && degreeIndex === 0));

              return (
                <button
                  key={midi}
                  type="button"
                  disabled={disabled}
                  onClick={() => handlePress(midi, degreeIndex)}
                  aria-label={labelFor(midi, degreeIndex)}
                  aria-pressed={inScale}
                  className={`relative flex flex-1 cursor-pointer flex-col items-center justify-end rounded-b-md border border-ink/15 pb-2 transition-colors duration-150 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--c-s-50))] disabled:cursor-default ${
                    isActive
                      ? "bg-[rgb(var(--c-s-50))]"
                      : inScale
                        ? "bg-[rgb(var(--c-s-50)/0.25)] hover:bg-[rgb(var(--c-s-50)/0.4)]"
                        : "bg-slate-950 hover:bg-[rgb(var(--c-s-50)/0.1)]"
                  }`}
                >
                  {inScale && (
                    <span
                      className={`text-small leading-none ${
                        isActive ? "text-slate-950" : "text-[rgb(var(--c-s-50))]"
                      }`}
                    >
                      {notes[degreeIndex]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ---- Black keys ----
              Positioned by white-key index so they sit on the seams. Rendered
              after the white keys so they stack above them without needing a
              z-index on every white key. */}
          {Array.from({ length: octaveCount }).map((_, o) =>
            BLACK_KEYS.map(({ offset, afterWhite }) => {
              const midi = startMidi + o * 12 + offset;
              const degreeIndex = degreeByMidi.get(midi);
              const inScale = degreeIndex !== undefined;
              const isActive =
                inScale &&
                (activeIndex === degreeIndex ||
                  (activeIndex === notes.length && degreeIndex === 0));

              // Centre of the seam between this white key and the next.
              const whiteIndex = o * 7 + afterWhite;
              const leftPct = ((whiteIndex + 1) / whiteCount) * 100;

              return (
                <button
                  key={midi}
                  type="button"
                  disabled={disabled}
                  onClick={() => handlePress(midi, degreeIndex)}
                  aria-label={labelFor(midi, degreeIndex)}
                  aria-pressed={inScale}
                  style={{
                    left: `${leftPct}%`,
                    width: `${(100 / whiteCount) * 0.62}%`,
                    transform: "translateX(-50%)",
                  }}
                  className={`absolute top-0 z-10 flex h-[62%] cursor-pointer flex-col items-center justify-end rounded-b-md border border-ink/40 pb-1.5 transition-colors duration-150 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--c-s-50))] disabled:cursor-default ${
                    isActive
                      ? "bg-[rgb(var(--c-s-50))]"
                      : inScale
                        ? "bg-[rgb(var(--c-s-50))]"
                        : "bg-[#2A2521] hover:bg-[#3A342E]"
                  }`}
                >
                  {inScale && (
                    // Paper on rust, whether lit or not. `[rgb(var(--c-s-50))]` is a dark
                    // rust (#7F3D14) in this system, so the near-black used
                    // for an unlit key's chassis lands at about 1.9:1 on it —
                    // the label was drawn and unreadable. Paper gives 7.6:1 on
                    // [rgb(var(--c-s-50))] and 5.4:1 on the lit [rgb(var(--c-s-50))].
                    <span className="text-small leading-none text-slate-950">
                      {notes[degreeIndex]}
                    </span>
                  )}
                </button>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
