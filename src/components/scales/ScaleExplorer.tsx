"use client";

import { useState } from "react";
import type { PrimaryInstrument } from "@prisma/client";
import type { RootKey } from "@/lib/music-theory";
import type { ScaleVariant } from "@/lib/scale-content";
import { KeySelector } from "@/components/scales/KeySelector";
import { TranspositionDashboard } from "@/components/scales/TranspositionDashboard";
import { ScaleChordsPanel } from "@/components/scales/ScaleChordsPanel";
import { useScalePlayer, useStopOnChange } from "@/components/scales/useScalePlayer";

export interface ScaleExplorerProps {
  variants: ScaleVariant[];
  /** The signed-in student's own instrument, so the dashboard below shows
      guitar/bass/piano correctly — see TranspositionDashboard's comment. */
  instrument: PrimaryInstrument | null;
}

/** Owns the shared root + variant selection so the dashboard and chords panel below always stay in sync. */
export function ScaleExplorer({ variants, instrument }: ScaleExplorerProps) {
  const [activeVariantIndex, setActiveVariantIndex] = useState(0);
  const [root, setRoot] = useState<RootKey>("C");
  const variant = variants[activeVariantIndex];

  // One player for the whole explorer, not one per panel: there is a single
  // pair of speakers, so a chord and a scale run must be able to interrupt
  // each other. Two independent hooks would happily play over one another.
  const player = useScalePlayer();

  // Changing key or variant mid-run would leave a scale sounding in the key
  // the user just navigated away from.
  useStopOnChange(player.stop, `${root}-${activeVariantIndex}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {variants.length > 1 ? (
          <div className="flex flex-wrap gap-1.5 rounded-full border border-ink/10 p-1">
            {variants.map((v, i) => (
              <button
                key={v.name}
                type="button"
                onClick={() => setActiveVariantIndex(i)}
                aria-pressed={i === activeVariantIndex}
                className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition ${
                  i === activeVariantIndex
                    ? "bg-[rgb(var(--c-a-400))] text-slate-950"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <KeySelector value={root} onChange={setRoot} />
      </div>

      <TranspositionDashboard variant={variant} root={root} player={player} instrument={instrument} />
      <ScaleChordsPanel variant={variant} root={root} player={player} />
    </div>
  );
}
