"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PrimaryInstrument } from "@prisma/client";
import { ROOT_KEYS, spellScale, type RootKey } from "@/lib/music-theory";
import { formulaForRoot, variantInAllKeys, type ScaleVariant } from "@/lib/scale-content";
import type { ScalePlayer } from "@/components/scales/useScalePlayer";
import { PianoKeyboard } from "@/components/scales/PianoKeyboard";
import { Fretboard, GUITAR_STANDARD_TUNING, BASS_STANDARD_TUNING } from "@/components/scales/Fretboard";

export interface InstrumentStageProps {
  variant: ScaleVariant;
  root: RootKey;
  player: ScalePlayer;
  /** Picks which instrument view renders. Defaults to the student's own
      account setting but is switchable right here, without a trip to
      Profile (see Fretboard.tsx's header for why the view exists). */
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
 * Piano/Guitar/Bass toggle. A quick way to preview any instrument's view and
 * sound without leaving the page, by direct instruction: going to Profile
 * just to peek at a different layout was the friction this replaces. The
 * chosen option is selected state, so it carries the signal tint.
 */
function InstrumentSwitcher({
  value,
  onChange,
}: {
  value: PrimaryInstrument | null;
  onChange: (instrument: PrimaryInstrument) => void;
}) {
  // No instrument on file, or one without its own view (drums/vocal/other),
  // reads as the keyboard.
  const active = value === "GUITAR" || value === "BASS" ? value : "PIANO_KEYBOARD";

  return (
    <div
      className="flex gap-1 rounded-full border border-ink/[0.08] bg-[rgb(var(--c-s-50)/0.04)] p-1"
      role="group"
      aria-label="Instrument view"
    >
      {INSTRUMENT_OPTIONS.map((option) => {
        const Glyph = INSTRUMENT_GLYPHS[option.value]!;
        const isActive = option.value === active;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
            className={cn(
              "tap flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-small font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive ? "bg-[rgb(var(--signal)/0.14)] text-signal" : "text-slate-400 hover:text-slate-100",
            )}
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

/**
 * The lesson page's middle-plane star: the scale on the student's
 * instrument, right under the lesson. Rendered whether or not audio is
 * supported (the shape of a kiñit is worth seeing even where it can't
 * sound; the keys are just inert then).
 */
export function InstrumentStage({ variant, root, player, instrument, onInstrumentChange }: InstrumentStageProps) {
  const spelled = useMemo(() => spellScale(root, formulaForRoot(variant, root)), [root, variant]);
  const { supported, isPlaying, activeIndex, playScale, playKey, stop } = player;
  const fretted = instrument === "GUITAR" || instrument === "BASS";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <InstrumentSwitcher value={instrument} onChange={onInstrumentChange} />
        {/* Only where the Web Audio API exists, rather than a control that
            silently does nothing. */}
        {supported && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => (isPlaying ? stop() : playScale(spelled.notes))}
            aria-label={isPlaying ? "Stop playback" : `Play the ${variant.name} scale in ${root}`}
          >
            {isPlaying ? <StopIcon /> : <PlayIcon />}
            {isPlaying ? "Stop" : `Hear it in ${root}`}
          </Button>
        )}
      </div>

      <div className="mt-4">
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
        <p className="mt-2 text-small text-slate-400">
          {fretted
            ? "Tap any note or fret to hear it. Frets outside the scale still sound."
            : "Tap any note or key to hear it. Keys outside the scale still sound."}
        </p>
      )}
    </div>
  );
}

/**
 * The Scale chart tool: the formula, the spelled notes as playable chips,
 * and the scale in all twelve keys with the current key marked.
 */
export function ScaleChart({ variant, root, player }: { variant: ScaleVariant; root: RootKey; player: ScalePlayer }) {
  const spelled = useMemo(() => spellScale(root, formulaForRoot(variant, root)), [root, variant]);
  const allKeys = useMemo(() => variantInAllKeys(variant), [variant]);
  const { supported, activeIndex, playDegree } = player;

  return (
    <div>
      <p className="text-small text-slate-400">{variant.name}</p>
      <p className="mt-1 font-mono text-small text-slate-300">{variant.formula.split("-").join(" – ")}</p>

      <motion.div
        key={root + variant.name}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.36 }}
        className="mt-4 flex flex-wrap gap-2"
      >
        {spelled.notes.map((note, i) => {
          // The run appends the root an octave up, which arrives as an index
          // one past the end of this list: light the root chip again for it.
          const isActive = activeIndex === i || (activeIndex === spelled.notes.length && i === 0);
          return (
            <button
              key={`${note}-${i}`}
              type="button"
              disabled={!supported}
              onClick={() => playDegree(spelled.notes, i)}
              aria-label={`Play ${note}, scale degree ${spelled.degrees[i]}`}
              className={cn(
                "tap flex w-14 cursor-pointer flex-col items-center rounded-control border py-2 transition duration-(--dur-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                isActive
                  ? "border-signal bg-[rgb(var(--signal)/0.14)] motion-safe:scale-105"
                  : "border-transparent bg-[rgb(var(--c-s-50)/0.04)] shadow-raised-low",
              )}
            >
              <span className={cn("text-body font-semibold", isActive ? "text-signal" : "text-slate-50")}>{note}</span>
              <span className="text-small text-slate-400">{spelled.degrees[i]}</span>
            </button>
          );
        })}
      </motion.div>

      {/* Pinned first column (plain CSS sticky): on a narrow panel this
          table scrolls sideways, and without it the Key column would scroll
          away and nothing would say which row you're on. border-separate,
          not border-collapse: Chromium fails to paint sticky cells inside a
          collapsed-border table. */}
      <div className="mt-5 overflow-x-auto rounded-control bg-neu-base shadow-raised-low">
        <table className="w-full min-w-[420px] border-separate border-spacing-0 text-small">
          <caption className="sr-only">
            {variant.name} spelled in all twelve keys. Current key: {root}.
          </caption>
          <thead>
            <tr className="text-left text-slate-400">
              <th scope="col" className="sticky left-0 z-10 bg-surface py-2 pl-3 pr-3 font-semibold shadow-[inset_-1px_0_0] shadow-ink/10">
                Key
              </th>
              {/* Degree tokens (b3, #4) are case-sensitive: no uppercase. */}
              {spelled.degrees.map((d, i) => (
                <th scope="col" key={`${d}-${i}`} className="py-2 pr-3 font-semibold first:pl-3">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROOT_KEYS.map((key) => {
              const current = key === root;
              return (
                <tr key={key} aria-current={current ? "true" : undefined}>
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 z-10 py-1.5 pl-3 pr-3 text-left font-semibold shadow-[inset_-1px_0_0] shadow-ink/10",
                      current ? "bg-slate-800 text-slate-50" : "bg-surface text-slate-300",
                    )}
                  >
                    {key}
                  </th>
                  {allKeys[key].map((note, i) => (
                    <td key={i} className={cn("py-1.5 pr-3 first:pl-3", current ? "bg-slate-800 text-slate-50" : "text-slate-400")}>
                      {note}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
