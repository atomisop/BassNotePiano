"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { PrimaryInstrument } from "@prisma/client";
import { ROOT_KEYS, spellScale, getScaleInAllKeys, type RootKey } from "@/lib/music-theory";
import type { ScaleVariant } from "@/lib/scale-content";
import type { ScalePlayer } from "@/components/scales/useScalePlayer";
import { PianoKeyboard } from "@/components/scales/PianoKeyboard";
import { Fretboard, GUITAR_STANDARD_TUNING, BASS_STANDARD_TUNING } from "@/components/scales/Fretboard";

export interface TranspositionDashboardProps {
  variant: ScaleVariant;
  root: RootKey;
  player: ScalePlayer;
  /** Picks which instrument view renders below — same scale data either
      way, see the header comment on Fretboard.tsx for why this exists.
      Defaults to the student's own account setting but is switchable right
      here via the buttons below, without a trip to Profile. */
  instrument: PrimaryInstrument | null;
  onInstrumentChange: (instrument: PrimaryInstrument) => void;
}

const INSTRUMENT_OPTIONS: { value: PrimaryInstrument; label: string }[] = [
  { value: "PIANO_KEYBOARD", label: "Piano" },
  { value: "GUITAR", label: "Guitar" },
  { value: "BASS", label: "Bass" },
];

function PianoGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="1.5" y="5" width="21" height="14" rx="1.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.3" />
      <rect x="5.5" y="5" width="2.6" height="8.5" fill="currentColor" />
      <rect x="10.7" y="5" width="2.6" height="8.5" fill="currentColor" />
      <rect x="15.9" y="5" width="2.6" height="8.5" fill="currentColor" />
    </svg>
  );
}

/** A plectrum, not a guitar body — the body shape read as a lopsided piano at 14px, and a pick is the one silhouette that's unambiguously "guitar" and nothing else at icon size. */
function GuitarGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2C16 2 18.8 5.2 18.8 9C18.8 15 13.5 19.8 12 22C10.5 19.8 5.2 15 5.2 9C5.2 5.2 8 2 12 2Z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A bass (F) clef — its curled hook and the two dots that name it, simplified but unmistakable, rather than a guitar-body shape shrunk down and re-labeled "bass". */
function BassGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 5C11.5 3.2 16 5.5 16 10C16 14 12.5 16.5 8.5 16"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="6.8" cy="5.1" r="2.1" fill="currentColor" />
      <circle cx="19" cy="7.5" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

const INSTRUMENT_GLYPHS: Record<PrimaryInstrument, (() => React.JSX.Element) | null> = {
  PIANO_KEYBOARD: PianoGlyph,
  GUITAR: GuitarGlyph,
  BASS: BassGlyph,
  DRUMS: null,
  VOCAL: null,
  OTHER: null,
};

/**
 * Piano/Guitar/Bass toggle for the dashboard below — a quick way to preview
 * any instrument's view and sound without leaving the page, by direct
 * instruction: going to Profile just to peek at a different layout was the
 * friction this replaces. Defaults to the account's own instrument (set at
 * onboarding) but is never restricted to it — every student sees all three
 * options here regardless of what they picked at signup.
 */
function InstrumentSwitcher({
  value,
  onChange,
}: {
  value: PrimaryInstrument | null;
  onChange: (instrument: PrimaryInstrument) => void;
}) {
  // Same fallback as the render branch below: no instrument on file, or one
  // without its own view (drums/vocal/other), reads as the keyboard.
  const active = value === "GUITAR" || value === "BASS" ? value : "PIANO_KEYBOARD";

  return (
    <div className="flex gap-1 rounded-full border border-ink/10 p-1" role="group" aria-label="Instrument view">
      {INSTRUMENT_OPTIONS.map((option) => {
        const Glyph = INSTRUMENT_GLYPHS[option.value]!;
        const isActive = option.value === active;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
            className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              isActive
                ? "bg-[rgb(var(--c-s-50))] text-slate-950"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            <Glyph />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

/** Spells `variant` at `root`, plus a reference table of all 12 keys with the active root highlighted. */
export function TranspositionDashboard({ variant, root, player, instrument, onInstrumentChange }: TranspositionDashboardProps) {
  const spelled = useMemo(() => spellScale(root, variant.formula), [root, variant.formula]);
  const allKeys = useMemo(() => getScaleInAllKeys(variant.formula), [variant.formula]);

  const { supported, isPlaying, activeIndex, playScale, playDegree, playKey, stop } = player;

  return (
    <div className="glass-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">
            Transposition Dashboard
          </p>
          <h2 className="mt-1 font-serif text-xl text-slate-50">{variant.name}</h2>
          <p className="mt-2 font-mono text-xs text-slate-500">
            {variant.formula.split("-").join(" – ")}
          </p>
        </div>

        {/* Rendered only where the Web Audio API actually exists, rather than
            showing a control that silently does nothing. */}
        {supported && (
          <button
            type="button"
            onClick={() => (isPlaying ? stop() : playScale(spelled.notes))}
            aria-label={
              isPlaying ? "Stop playback" : `Play the ${variant.name} scale in ${root}`
            }
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[rgb(var(--c-s-50)/0.4)] px-3.5 py-2 text-sm font-medium text-[rgb(var(--c-s-50))] transition duration-200 hover:border-[rgb(var(--c-s-50))] hover:bg-[rgb(var(--c-s-50)/0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--c-s-50)/0.7)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          >
            {isPlaying ? <StopIcon /> : <PlayIcon />}
            {isPlaying ? "Stop" : "Hear this scale"}
          </button>
        )}
      </div>

      <motion.div
        key={root + variant.name}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.36 }}
        className="mt-6 flex flex-wrap gap-3"
      >
        {spelled.notes.map((note, i) => {
          // The run appends the root an octave up, which arrives as an index
          // one past the end of this list — light the root chip again for it,
          // otherwise the final note of every scale looks unplayed.
          const isActive = activeIndex === i || (activeIndex === spelled.notes.length && i === 0);

          return (
            <button
              key={`${note}-${i}`}
              type="button"
              disabled={!supported}
              onClick={() => playDegree(spelled.notes, i)}
              aria-label={`Play ${note}, scale degree ${spelled.degrees[i]}`}
              className={`flex w-16 cursor-pointer flex-col items-center rounded-xl border py-3 transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--c-s-50)/0.7)] disabled:cursor-default motion-safe:duration-200 ${
                isActive
                  ? "border-[rgb(var(--c-s-50))] bg-[rgb(var(--c-s-50)/0.2)] motion-safe:scale-105"
                  : "border-[rgb(var(--c-s-50)/0.25)] bg-[rgb(var(--c-s-50)/0.05)] hover:border-[rgb(var(--c-s-50)/0.6)] hover:bg-[rgb(var(--c-s-50)/0.1)]"
              }`}
            >
              <span className="font-serif text-lg text-slate-50">{note}</span>
              <span className="mt-1 text-[11px] text-[rgb(var(--c-s-50)/0.8)]">{spelled.degrees[i]}</span>
            </button>
          );
        })}
      </motion.div>

      {/* The same scale, a third way: where it sits under the hands (or the
          fingers, on a fretted string instrument). Rendered whether or not
          audio is supported — the shape of a kiñit on the instrument is
          worth seeing even on a browser that can't sound it; the keys/frets
          are just inert there.

          Which view: a guitar or bass student who lands on a piano diagram
          for every scale in the curriculum is being shown an instrument
          they didn't sign up for — the theory is identical, only the
          physical layout differs, so this picks the one that's actually
          true to what they're holding. PIANO_KEYBOARD, OTHER, and no
          instrument on file all default to the keyboard. */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">View as</p>
        <InstrumentSwitcher value={instrument} onChange={onInstrumentChange} />
      </div>

      <div className="mt-3">
        {instrument === "GUITAR" ? (
          <Fretboard
            notes={spelled.notes}
            degrees={spelled.degrees}
            activeIndex={activeIndex}
            onPlayKey={playKey}
            disabled={!supported}
            tuning={GUITAR_STANDARD_TUNING}
            instrumentLabel="Guitar"
          />
        ) : instrument === "BASS" ? (
          <Fretboard
            notes={spelled.notes}
            degrees={spelled.degrees}
            activeIndex={activeIndex}
            onPlayKey={playKey}
            disabled={!supported}
            tuning={BASS_STANDARD_TUNING}
            instrumentLabel="Bass"
          />
        ) : (
          <PianoKeyboard
            notes={spelled.notes}
            degrees={spelled.degrees}
            activeIndex={activeIndex}
            onPlayKey={playKey}
            disabled={!supported}
          />
        )}
      </div>

      {supported && (
        <p className="mt-3 text-[11px] text-slate-500">
          {instrument === "GUITAR" || instrument === "BASS"
            ? "Tap any note or fret to hear it. Frets outside the scale still sound."
            : "Tap any note or key to hear it. Keys outside the scale still sound."}
        </p>
      )}

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="sr-only">
            {variant.name} spelled in all twelve keys. Current key: {root}.
          </caption>
          <thead>
            <tr className="text-left text-[11px] tracking-wide text-slate-500">
              <th scope="col" className="pb-2 pr-4 font-medium uppercase">
                Key
              </th>
              {/* Degree tokens (b3, #4, ...) are case-sensitive — no uppercase transform here. */}
              {spelled.degrees.map((d, i) => (
                <th scope="col" key={`${d}-${i}`} className="pb-2 pr-4 font-medium">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROOT_KEYS.map((key) => (
              <tr
                key={key}
                className={`border-t border-ink/5 ${key === root ? "bg-[rgb(var(--c-s-50)/0.05)]" : ""}`}
              >
                <th
                  scope="row"
                  className={`py-2 pr-4 text-left font-medium ${
                    key === root ? "text-[rgb(var(--c-s-50))]" : "text-slate-300"
                  }`}
                >
                  {key}
                </th>
                {allKeys[key].map((note, i) => (
                  <td key={i} className="py-2 pr-4 text-slate-400">
                    {note}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
