"use client";

import { useMemo } from "react";
import { buildChordOnDegree, type RootKey } from "@/lib/music-theory";
import type { ScaleVariant } from "@/lib/scale-content";
import type { ScalePlayer } from "@/components/scales/useScalePlayer";

export interface ScaleChordsPanelProps {
  variant: ScaleVariant;
  root: RootKey;
  player: ScalePlayer;
}

function ChordPlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z" />
    </svg>
  );
}

/** Native triads/sevenths built from `variant`'s own scale tones, spelled at `root`. */
export function ScaleChordsPanel({ variant, root, player }: ScaleChordsPanelProps) {
  const chords = useMemo(
    () =>
      variant.nativeChords.map((spec) => ({
        spec,
        chord: buildChordOnDegree(root, spec.degree, spec.quality),
      })),
    [variant, root],
  );

  const { supported, playChordNotes } = player;

  return (
    <div className="glass-surface p-6">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">
        Scale Chords
      </p>
      <h2 className="mt-1 font-serif text-xl text-slate-50">Native chords — {variant.name}</h2>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {chords.map(({ spec, chord }, i) => {
          const body = (
            <>
              {/* Roman-numeral casing is meaningful here (I vs i signals major vs minor quality) — no uppercase transform. */}
              <p className="text-xs font-medium tracking-wide text-slate-500">{spec.label}</p>
              <p className="mt-1 font-serif text-2xl text-[rgb(var(--c-a-300))]">{chord.symbol}</p>
              <p className="mt-1.5 text-xs text-slate-500">{chord.notes.join(" – ")}</p>
            </>
          );

          // Without audio there is nothing to click, so it stays a plain
          // panel rather than a button that looks interactive and isn't.
          if (!supported) {
            return (
              <div
                key={`${spec.label}-${i}`}
                className="rounded-xl border border-ink/10 bg-slate-900 p-4"
              >
                {body}
              </div>
            );
          }

          return (
            <button
              key={`${spec.label}-${i}`}
              type="button"
              onClick={() => playChordNotes(chord.notes)}
              aria-label={`Play the chord ${chord.symbol}`}
              className="group cursor-pointer rounded-xl border border-ink/10 bg-slate-900 p-4 text-left transition duration-200 hover:border-[rgb(var(--c-a-400)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--c-a-400)/0.7)]"
            >
              {body}
              <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 transition-colors group-hover:text-[rgb(var(--c-a-300))]">
                <ChordPlayIcon />
                Play chord
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
