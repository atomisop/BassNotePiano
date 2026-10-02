"use client";

import { useMemo } from "react";
import { pitchClassOf } from "@/lib/music-theory";

/**
 * A playable fretboard showing where a spelled scale physically sits on a
 * standard-tuned fretted string instrument — the guitar/bass equivalent of
 * PianoKeyboard: same props, same underlying MIDI/degree data, a different
 * physical layout for a different instrument.
 *
 * Built because routing a guitar or bass student to the piano keyboard for
 * every scale in the curriculum was actively misleading them about what
 * they signed up for, by direct instruction: the theory is identical
 * either way, only the instrument view should differ.
 *
 * Unlike the piano, which lights up the exact MIDI numbers one specific
 * ascending run happens to use, this lights up every position on the neck
 * that sounds an in-scale PITCH CLASS, across every string and fret. That's
 * the honest picture of a fretboard: a guitarist needs to see every place a
 * note lives, not just the one octave the piano's linear layout happens to
 * pick.
 *
 * Standard tuning only — drop tunings, 7-string guitar, and 5-string bass
 * are out of scope. This teaches where a scale sits on the instrument the
 * large majority of students who haven't said otherwise are actually
 * holding.
 */

const FRET_COUNT = 12;
const SINGLE_DOT_FRETS = new Set([3, 5, 7, 9]);
const DOUBLE_DOT_FRET = 12;
const CELL_WIDTH = 40;
const OPEN_CELL_WIDTH = 32;

export interface StringInstrumentTuning {
  /** Open-string MIDI numbers, highest-pitched string first — the row order every printed tab uses. */
  openStringMidi: number[];
  /** Open-string note names in the same order, for row labels and screen readers. */
  openStringName: string[];
}

/** E A D G B E, low to high — MIDI 40/45/50/55/59/64. */
export const GUITAR_STANDARD_TUNING: StringInstrumentTuning = {
  openStringMidi: [64, 59, 55, 50, 45, 40],
  openStringName: ["E", "B", "G", "D", "A", "E"],
};

/** E A D G, low to high, one octave under a guitar's same four letter names — MIDI 28/33/38/43. */
export const BASS_STANDARD_TUNING: StringInstrumentTuning = {
  openStringMidi: [43, 38, 33, 28],
  openStringName: ["G", "D", "A", "E"],
};

export interface FretboardProps {
  /** Scale note names, already spelled (e.g. ["Db","Fb","Gb","Ab","Cb"]). */
  notes: string[];
  /** Degree tokens matching `notes`, e.g. ["1","b3","4","5","b7"]. */
  degrees: string[];
  /** Index of the note currently sounding, or null. */
  activeIndex: number | null;
  /**
   * Fired with the pressed position's own MIDI number, plus which scale
   * degree it represents (null when the position isn't in the scale).
   */
  onPlayKey: (midi: number, degreeIndex: number | null) => void;
  disabled?: boolean;
  tuning: StringInstrumentTuning;
  /** "Guitar" or "Bass" — used only for this group's own aria-label. */
  instrumentLabel: string;
}

export function Fretboard({
  notes,
  degrees,
  activeIndex,
  onPlayKey,
  disabled,
  tuning,
  instrumentLabel,
}: FretboardProps) {
  const { openStringMidi, openStringName } = tuning;

  // Pitch class (0-11), not exact MIDI: the same note genuinely recurs in
  // many places on a fretboard, unlike the piano's single ascending run, so
  // every occurrence needs to light up, not just one.
  const degreeByPitchClass = useMemo(() => {
    const map = new Map<number, number>();
    notes.forEach((note, i) => {
      const pitchClass = pitchClassOf(note);
      if (!map.has(pitchClass)) map.set(pitchClass, i);
    });
    return map;
  }, [notes]);

  function handlePress(midi: number, degreeIndex: number | undefined) {
    if (disabled) return;
    onPlayKey(midi, degreeIndex ?? null);
  }

  function labelFor(degreeIndex: number | undefined, stringName: string, fret: number) {
    const position = fret === 0 ? `open ${stringName} string` : `${stringName} string, fret ${fret}`;
    if (degreeIndex === undefined) return `${position}, not in this scale`;
    return `${position}: ${notes[degreeIndex]}, scale degree ${degrees[degreeIndex]}`;
  }

  return (
    <div
      className="flex"
      role="group"
      aria-label={`${instrumentLabel} fretboard — scale notes are highlighted`}
    >
      {/* Fixed string-name column, outside the scroll area so it stays
          readable while the fretboard itself scrolls horizontally. Order is
          high string to low, top to bottom — the same convention every
          printed tab uses. */}
      <div className="flex shrink-0 flex-col gap-[3px] pr-2">
        {openStringName.map((name, i) => (
          <div key={i} className="flex h-8 w-5 items-center justify-center text-small text-slate-500">
            {name}
          </div>
        ))}
        <div className="mt-1.5 h-[22px]" aria-hidden />
      </div>

      <div className="-mx-1 flex-1 overflow-x-auto px-1 pb-1">
        <div className="select-none" style={{ minWidth: `${OPEN_CELL_WIDTH + FRET_COUNT * CELL_WIDTH}px` }}>
          <div className="flex flex-col gap-[3px]">
            {openStringMidi.map((openMidi, stringIndex) => (
              <div key={stringIndex} className="flex">
                {Array.from({ length: FRET_COUNT + 1 }).map((_, fret) => {
                  const midi = openMidi + fret;
                  const pitchClass = ((midi % 12) + 12) % 12;
                  const degreeIndex = degreeByPitchClass.get(pitchClass);
                  const inScale = degreeIndex !== undefined;
                  const isActive =
                    inScale &&
                    (activeIndex === degreeIndex || (activeIndex === notes.length && degreeIndex === 0));

                  return (
                    <button
                      key={fret}
                      type="button"
                      disabled={disabled}
                      onClick={() => handlePress(midi, degreeIndex)}
                      aria-label={labelFor(degreeIndex, openStringName[stringIndex], fret)}
                      aria-pressed={inScale}
                      style={{ width: fret === 0 ? OPEN_CELL_WIDTH : CELL_WIDTH }}
                      className={`flex h-8 shrink-0 cursor-pointer items-center justify-center border border-ink/10 text-small transition-colors duration-150 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--c-s-50))] disabled:cursor-default ${
                        fret === 0 ? "border-r-2 border-r-ink/40" : ""
                      } ${
                        isActive
                          ? "bg-[rgb(var(--signal))] text-[rgb(var(--signal-ink))] shadow-[0_0_12px_rgb(var(--signal)/0.45)]"
                          : inScale
                            ? "bg-[rgb(var(--c-s-50)/0.25)] text-[rgb(var(--c-s-50))] hover:bg-[rgb(var(--c-s-50)/0.4)]"
                            : "bg-slate-950 hover:bg-[rgb(var(--c-s-50)/0.1)]"
                      }`}
                    >
                      {inScale && notes[degreeIndex]}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Fret markers + numbers, purely decorative/orientation — the
              inlay dots every real fretboard has at 3/5/7/9/12. */}
          <div className="mt-1.5 flex" aria-hidden>
            {Array.from({ length: FRET_COUNT + 1 }).map((_, fret) => (
              <div
                key={fret}
                className="flex shrink-0 flex-col items-center gap-1"
                style={{ width: fret === 0 ? OPEN_CELL_WIDTH : CELL_WIDTH }}
              >
                {fret > 0 && (SINGLE_DOT_FRETS.has(fret) || fret === DOUBLE_DOT_FRET) && (
                  <span className="flex gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-700" />
                    {fret === DOUBLE_DOT_FRET && <span className="h-1.5 w-1.5 rounded-full bg-slate-700" />}
                  </span>
                )}
                {/* text-slate-500, not -600 — see the accessibility pass's
                    SiteFooter comment: -600 fails AA (4.5:1) for real text
                    on this ground, -500 clears it. */}
                <span className="text-small text-slate-500">{fret}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
