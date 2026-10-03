"use client";

import { useMemo } from "react";
import { buildChordOnDegree, spellScale, type RootKey } from "@/lib/music-theory";
import { formulaForRoot, tokenForRoot, type ScaleVariant } from "@/lib/scale-content";
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
  const chords = useMemo(() => {
    const scaleNotes =
      variant.chordSpelling === "scale" ? spellScale(root, formulaForRoot(variant, root)).notes : undefined;
    return variant.nativeChords.map((spec) => ({
      spec,
      chord: buildChordOnDegree(root, tokenForRoot(variant, spec.degree, root), spec.quality, scaleNotes),
    }));
  }, [variant, root]);

  const { supported, playChordNotes } = player;

  return (
    // Lives inside the lesson page's Chords tool panel, which supplies the
    // heading, so this is just the chord list.
    <div>
      <p className="text-small text-slate-400">Native chords of {variant.name}, in {root}.</p>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {chords.map(({ spec, chord }, i) => {
          const body = (
            <>
              {/* Roman-numeral casing is meaningful here (I vs i signals major vs minor quality) — no uppercase transform. */}
              <p className="text-small font-semibold text-slate-400">{spec.label}</p>
              <p className="mt-0.5 text-body font-semibold text-slate-50">{chord.symbol}</p>
              <p className="text-small text-slate-400">{chord.notes.join(" – ")}</p>
            </>
          );

          // Without audio there is nothing to click, so it stays a plain
          // panel rather than a button that looks interactive and isn't.
          if (!supported) {
            return (
              <div
                key={`${spec.label}-${i}`}
                className="rounded-control border border-ink/10 p-3"
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
              className="group flex cursor-pointer items-center justify-between gap-3 rounded-control border border-ink/10 p-3 text-left transition-colors duration-(--dur-fast) hover:border-ink/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>{body}</span>
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/15 text-slate-300 transition-colors group-hover:border-signal group-hover:text-signal" aria-hidden>
                <ChordPlayIcon />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
