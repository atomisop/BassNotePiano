"use client";

import { useMemo } from "react";
import { buildChordOnDegree, type RootKey } from "@/lib/music-theory";
import type { ScaleVariant } from "@/lib/scale-content";

export interface ScaleChordsPanelProps {
  variant: ScaleVariant;
  root: RootKey;
}

/** Native triads/sevenths built from `variant`'s own scale tones, spelled at `root`. */
export function ScaleChordsPanel({ variant, root }: ScaleChordsPanelProps) {
  const chords = useMemo(
    () => variant.nativeChords.map((spec) => ({ spec, chord: buildChordOnDegree(root, spec.degree, spec.quality) })),
    [variant, root],
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Scale Chords</p>
      <h2 className="mt-1 font-serif text-xl text-slate-50">Native chords — {variant.name}</h2>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {chords.map(({ spec, chord }, i) => (
          <div key={`${spec.label}-${i}`} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            {/* Roman-numeral casing is meaningful here (I vs i signals major vs minor quality) — no uppercase transform. */}
            <p className="text-xs font-medium tracking-wide text-slate-500">{spec.label}</p>
            <p className="mt-1 font-serif text-2xl text-amber-300">{chord.symbol}</p>
            <p className="mt-1.5 text-xs text-slate-500">{chord.notes.join(" – ")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
