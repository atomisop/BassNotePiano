"use client";

import { useCallback, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
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

  // The key under a finger or mouse right now, for the pressed look.
  const [pressedMidi, setPressedMidi] = useState<number | null>(null);

  // Sound on pointer-down, not on click: a click only fires after the finger
  // lifts, which reads as lag on a musical instrument. Keyboard users still
  // play keys with Enter/Space through onKeyDown.
  const press = useCallback(
    (e: PointerEvent<HTMLButtonElement>, midi: number, degreeIndex: number | undefined) => {
      if (disabled || e.button > 0) return;
      setPressedMidi(midi);
      onPlayKey(midi, degreeIndex ?? null);
    },
    [disabled, onPlayKey],
  );
  const release = useCallback(() => setPressedMidi(null), []);
  const keyPress = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, midi: number, degreeIndex: number | undefined) => {
      if (disabled || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      onPlayKey(midi, degreeIndex ?? null);
    },
    [disabled, onPlayKey],
  );

  function labelFor(midi: number, degreeIndex: number | undefined) {
    const pitch = PITCH_NAMES[((midi % 12) + 12) % 12];
    if (degreeIndex === undefined) return `${pitch}, not in this scale`;
    return `${notes[degreeIndex]}, scale degree ${degrees[degreeIndex]}`;
  }

  function isSounding(degreeIndex: number | undefined) {
    return degreeIndex !== undefined && (activeIndex === degreeIndex || (activeIndex === notes.length && degreeIndex === 0));
  }

  const keyHandlers = (midi: number, degreeIndex: number | undefined) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => press(e, midi, degreeIndex),
    onPointerUp: release,
    onPointerLeave: release,
    onPointerCancel: release,
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => keyPress(e, midi, degreeIndex),
  });

  /*
   * STEP 5 look: the keyboard is the lesson page's middle-plane star, drawn
   * as a real instrument (ivory white keys, glossy black keys, soft depth)
   * in every theme. Color follows STEP 2C: scale notes are marked in ink and
   * paper (information), and green appears only on the key that is sounding
   * or under a finger right now.
   */
  return (
    <div>
      {/* Horizontal scroll rather than shrinking the keys: below roughly
          320px a two-octave keyboard gives each white key under 20px, which
          is narrower than a fingertip. Scrolling keeps them playable. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <div
          className="relative mx-auto touch-manipulation select-none piano-case rounded-b-control rounded-t-sm p-1.5 pt-2"
          style={{ minWidth: `${whiteCount * 36}px`, height: 176 }}
          role="group"
          aria-label="Piano keyboard. Scale notes are marked; tap a key to hear it."
        >
          <div className="relative h-full">
            {/* ---- White keys ---- */}
            <div className="absolute inset-0 flex gap-[2px]">
              {whiteKeys.map(({ midi, degreeIndex }) => {
                const inScale = degreeIndex !== undefined;
                const lit = isSounding(degreeIndex) || pressedMidi === midi;
                return (
                  <button
                    key={midi}
                    type="button"
                    disabled={disabled}
                    {...keyHandlers(midi, degreeIndex)}
                    aria-label={labelFor(midi, degreeIndex)}
                    className={cn(
                      "relative flex flex-1 cursor-pointer flex-col items-center justify-end rounded-b-[7px] pb-3 outline-none transition-[background,box-shadow,transform] duration-75 ease-out focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-default motion-reduce:transition-none",
                      lit
                        ? "bg-[rgb(var(--signal))] shadow-pressed-low"
                        : "piano-white",
                    )}
                  >
                    {inScale && (
                      <span
                        className={cn(
                          "flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-small font-semibold leading-none",
                          lit ? "text-[rgb(var(--signal-ink))]" : "piano-marker-on-white",
                        )}
                      >
                        {notes[degreeIndex]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ---- Black keys ----
                Positioned by white-key index so they sit on the seams, and
                rendered after the white keys so they stack above them. */}
            {Array.from({ length: octaveCount }).map((_, o) =>
              BLACK_KEYS.map(({ offset, afterWhite }) => {
                const midi = startMidi + o * 12 + offset;
                const degreeIndex = degreeByMidi.get(midi);
                const inScale = degreeIndex !== undefined;
                const lit = isSounding(degreeIndex) || pressedMidi === midi;

                // Centre of the seam between this white key and the next.
                const whiteIndex = o * 7 + afterWhite;
                const leftPct = ((whiteIndex + 1) / whiteCount) * 100;

                return (
                  <button
                    key={midi}
                    type="button"
                    disabled={disabled}
                    {...keyHandlers(midi, degreeIndex)}
                    aria-label={labelFor(midi, degreeIndex)}
                    style={{
                      left: `${leftPct}%`,
                      width: `${(100 / whiteCount) * 0.6}%`,
                      transform: `translateX(-50%) translateY(0)`,
                    }}
                    className={cn(
                      "absolute top-0 z-10 flex h-[60%] cursor-pointer flex-col items-center justify-end rounded-b-[6px] pb-2 outline-none transition-[background,box-shadow,transform] duration-75 ease-out focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-default motion-reduce:transition-none",
                      lit
                        ? "bg-[rgb(var(--signal))] shadow-pressed-low"
                        : "piano-black",
                    )}
                  >
                    {inScale && (
                      <span
                        className={cn(
                          "flex h-6 min-w-6 items-center justify-center rounded-full px-0.5 text-small font-semibold leading-none",
                          lit ? "text-[rgb(var(--signal-ink))]" : "piano-marker-on-black",
                        )}
                      >
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
    </div>
  );
}
