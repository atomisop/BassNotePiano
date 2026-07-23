"use client";

import { useState } from "react";
import type { RootKey } from "@/lib/music-theory";
import type { ScaleVariant } from "@/lib/scale-content";
import { KeySelector } from "@/components/scales/KeySelector";
import { TranspositionDashboard } from "@/components/scales/TranspositionDashboard";
import { ScaleChordsPanel } from "@/components/scales/ScaleChordsPanel";

export interface ScaleExplorerProps {
  variants: ScaleVariant[];
}

/** Owns the shared root + variant selection so the dashboard and chords panel below always stay in sync. */
export function ScaleExplorer({ variants }: ScaleExplorerProps) {
  const [activeVariantIndex, setActiveVariantIndex] = useState(0);
  const [root, setRoot] = useState<RootKey>("C");
  const variant = variants[activeVariantIndex];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {variants.length > 1 ? (
          <div className="flex flex-wrap gap-1.5 rounded-full border border-slate-800 p-1">
            {variants.map((v, i) => (
              <button
                key={v.name}
                type="button"
                onClick={() => setActiveVariantIndex(i)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  i === activeVariantIndex
                    ? "bg-amber-400 text-slate-950"
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

      <TranspositionDashboard variant={variant} root={root} />
      <ScaleChordsPanel variant={variant} root={root} />
    </div>
  );
}
