"use client";

import { useEffect, useMemo, useState } from "react";
import { pitchClassOf } from "@/lib/music-theory";

/**
 * A playable fretboard showing where a spelled scale physically sits on a
 * standard-tuned fretted string instrument, the guitar/bass equivalent of
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
 * Standard tuning only, drop tunings, 7-string guitar, and 5-string bass
 * are out of scope. This teaches where a scale sits on the instrument the
 * large majority of students who haven't said otherwise are actually
 * holding.
 */

const FRET_COUNT = 12;
const SINGLE_DOT_FRETS = new Set([3, 5, 7, 9]);
const DOUBLE_DOT_FRET = 12;
// Real fret spacing: each fret is 2^(-1/12) the width of the one before, so
// the board narrows toward the body like an actual neck. The first fret is
// the widest, which is also the easiest to press.
const FIRST_FRET_WIDTH = 100;
const FRET_WIDTHS = Array.from({ length: FRET_COUNT }, (_, i) => FIRST_FRET_WIDTH * Math.pow(2, -i / 12));
const OPEN_WIDTH = 44; // the open-string area, left of the nut
const NUT_WIDTH = 6;
const NECK_WIDTH = OPEN_WIDTH + NUT_WIDTH + FRET_WIDTHS.reduce((sum, w) => sum + w, 0);
// Plain strings are thin steel; guitar's three low strings and every bass
// string are wound, so they are thicker and bronze.
const GUITAR_STRING_PX = [1.2, 1.6, 2.1, 2.8, 3.5, 4.2];
const BASS_STRING_PX = [3, 3.8, 4.6, 5.4];

export interface StringInstrumentTuning {
  /** Open-string MIDI numbers, highest-pitched string first, the row order every printed tab uses. */
  openStringMidi: number[];
  /** Open-string note names in the same order, for row labels and screen readers. */
  openStringName: string[];
}

/** E A D G B E, low to high, MIDI 40/45/50/55/59/64. */
export const GUITAR_STANDARD_TUNING: StringInstrumentTuning = {
  openStringMidi: [64, 59, 55, 50, 45, 40],
  openStringName: ["E", "B", "G", "D", "A", "E"],
};

/** E A D G, low to high, one octave under a guitar's same four letter names, MIDI 28/33/38/43. */
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
  /** The exact pitch sounding now. One spot on the neck lights for it, not every place the same letter appears. */
  activeMidi: number | null;
  /**
   * Fired with the pressed position's own MIDI number, plus which scale
   * degree it represents (null when the position isn't in the scale).
   */
  onPlayKey: (midi: number, degreeIndex: number | null) => void;
  disabled?: boolean;
  tuning: StringInstrumentTuning;
  /** "Guitar" or "Bass", used only for this group's own aria-label. */
  instrumentLabel: string;
}

export function Fretboard({
  notes,
  degrees,
  activeIndex: _activeIndex,
  activeMidi,
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

  // The string and fret the player last pressed, so a tapped spot lights
  // itself even where the same pitch also sits on another string.
  const [pressed, setPressed] = useState<{ stringIndex: number; fret: number; midi: number } | null>(null);

  // A tapped spot only stays lit while its note is the one sounding.
  useEffect(() => {
    if (pressed && pressed.midi !== activeMidi) setPressed(null);
  }, [activeMidi, pressed]);

  // The one spot lit while a scale plays: the same pitch can sit on two or
  // three strings, so pick the lowest fret (a pressed spot wins when it is
  // the note that is sounding).
  const litCell = useMemo(() => {
    if (activeMidi === null) return null;
    if (pressed && pressed.midi === activeMidi) return pressed;
    let best: { stringIndex: number; fret: number } | null = null;
    openStringMidi.forEach((openMidi, stringIndex) => {
      const fret = activeMidi - openMidi;
      if (fret < 0 || fret > FRET_COUNT) return;
      if (!best || fret < best.fret || (fret === best.fret && stringIndex > best.stringIndex)) best = { stringIndex, fret };
    });
    return best;
  }, [activeMidi, pressed, openStringMidi]);

  function handlePress(midi: number, degreeIndex: number | undefined, stringIndex: number, fret: number) {
    if (disabled) return;
    setPressed({ stringIndex, fret, midi });
    onPlayKey(midi, degreeIndex ?? null);
  }

  function labelFor(degreeIndex: number | undefined, stringName: string, fret: number) {
    const position = fret === 0 ? `open ${stringName} string` : `${stringName} string, fret ${fret}`;
    if (degreeIndex === undefined) return `${position}, not in this scale`;
    return `${position}: ${notes[degreeIndex]}, scale degree ${degrees[degreeIndex]}`;
  }

  const stringCount = openStringMidi.length;
  const rowHeight = stringCount > 4 ? 32 : 42;
  const stringPx = stringCount > 4 ? GUITAR_STRING_PX : BASS_STRING_PX;
  const firstWound = stringCount > 4 ? 3 : 0;
  const neckHeight = rowHeight * stringCount;

  // Left edge of each fret's cell (fret 1..12), measured from the nut.
  const fretLeft: number[] = [];
  FRET_WIDTHS.reduce((x, w) => {
    fretLeft.push(x);
    return x + w;
  }, OPEN_WIDTH + NUT_WIDTH);

  return (
    <div
      className="flex"
      role="group"
      aria-label={`${instrumentLabel} fretboard, scale notes are highlighted`}
    >
      {/* String names stay outside the scroll area so they remain readable
          while the neck scrolls. High string at the top, the same order a
          printed tab uses. */}
      <div className="flex shrink-0 flex-col pr-2">
        {openStringName.map((name, i) => (
          <div key={i} className="flex w-5 items-center justify-center text-small text-slate-400" style={{ height: rowHeight }}>
            {name}
          </div>
        ))}
        <div className="mt-2 h-[22px]" aria-hidden />
      </div>

      <div className="-mx-1 flex-1 overflow-x-auto px-1 pb-2">
        <div className="select-none" style={{ minWidth: NECK_WIDTH }}>
          <div className="relative overflow-hidden rounded-r-md fretboard-neck" style={{ width: NECK_WIDTH, height: neckHeight }}>
            {/* Open-string area (the headstock side of the nut) and the nut. */}
            <div aria-hidden className="absolute inset-y-0 left-0 fretboard-headstock" style={{ width: OPEN_WIDTH }} />
            <div aria-hidden className="absolute inset-y-0 fretboard-nut" style={{ left: OPEN_WIDTH, width: NUT_WIDTH }} />

            {/* Fret wires between the cells. */}
            {fretLeft.slice(1).map((left, i) => (
              <div key={i} aria-hidden className="absolute inset-y-0 w-[3px] fretboard-fret" style={{ left: left - 1.5 }} />
            ))}
            <div aria-hidden className="absolute inset-y-0 w-[3px] fretboard-fret" style={{ left: NECK_WIDTH - 3 }} />

            {/* Pearl inlays on the board, centered between the strings. */}
            {fretLeft.map((left, i) => {
              const fret = i + 1;
              if (!SINGLE_DOT_FRETS.has(fret) && fret !== DOUBLE_DOT_FRET) return null;
              const centerX = left + FRET_WIDTHS[i] / 2;
              const ys = fret === DOUBLE_DOT_FRET ? [neckHeight / 3, (neckHeight * 2) / 3] : [neckHeight / 2];
              return ys.map((y, k) => (
                <span
                  key={`${fret}-${k}`}
                  aria-hidden
                  className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full fretboard-inlay"
                  style={{ left: centerX, top: y }}
                />
              ));
            })}

            {/* The strings, drawn across the whole neck. */}
            {openStringMidi.map((_, stringIndex) => (
              <div
                key={stringIndex}
                aria-hidden
                className={`pointer-events-none absolute left-0 right-0 ${stringIndex >= firstWound ? "fretboard-string-wound" : "fretboard-string"}`}
                style={{
                  top: stringIndex * rowHeight + rowHeight / 2 - stringPx[stringIndex] / 2,
                  height: stringPx[stringIndex],
                }}
              />
            ))}

            {/* The playable positions: one button per string and fret, with
                the note shown as a fingertip on the string. */}
            <div className="absolute inset-0 flex flex-col">
              {openStringMidi.map((openMidi, stringIndex) => (
                <div key={stringIndex} className="flex" style={{ height: rowHeight }}>
                  {Array.from({ length: FRET_COUNT + 1 }).map((_, fret) => {
                    const midi = openMidi + fret;
                    const pitchClass = ((midi % 12) + 12) % 12;
                    const degreeIndex = degreeByPitchClass.get(pitchClass);
                    const inScale = degreeIndex !== undefined;
                    const isActive = inScale && litCell?.stringIndex === stringIndex && litCell?.fret === fret;
                    const width = fret === 0 ? OPEN_WIDTH + NUT_WIDTH : FRET_WIDTHS[fret - 1];

                    return (
                      <button
                        key={fret}
                        type="button"
                        disabled={disabled}
                        onClick={() => handlePress(midi, degreeIndex, stringIndex, fret)}
                        aria-label={labelFor(degreeIndex, openStringName[stringIndex], fret)}
                        aria-pressed={inScale}
                        style={{ width }}
                        className="group relative flex shrink-0 cursor-pointer items-center justify-center focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal disabled:cursor-default"
                      >
                        {inScale ? (
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-small font-semibold leading-none transition-transform duration-100 group-active:scale-90 ${
                              isActive
                                ? "bg-signal text-signal-ink shadow-[0_0_12px_rgb(var(--signal)/0.6)]"
                                : "fretboard-finger"
                            }`}
                          >
                            {notes[degreeIndex]}
                          </span>
                        ) : (
                          <span aria-hidden className="h-4 w-4 rounded-full bg-white/0 transition-colors group-hover:bg-white/15" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Fret numbers, aligned under each fret. */}
          <div className="relative mt-2 h-[22px]" aria-hidden style={{ width: NECK_WIDTH }}>
            {fretLeft.map((left, i) => (
              <span key={i} className="absolute -translate-x-1/2 text-small text-slate-500" style={{ left: left + FRET_WIDTHS[i] / 2 }}>
                {i + 1}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
