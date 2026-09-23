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
  /** Every scale is now standalone (one ScaleGroup, one variant) — see
      SCALE_CONTENT in scale-content.ts. Still an array of length 1 rather
      than a single ScaleVariant so this component doesn't need to change
      how it reads its data. */
  variants: ScaleVariant[];
  /** The signed-in student's own instrument, used only as the *default* view
      below — see the instrumentView state right under this and
      TranspositionDashboard's switcher. Never re-read after mount, so
      switching pages restores the account's own choice again. */
  instrument: PrimaryInstrument | null;
}

/** Owns the shared root selection so the dashboard and chords panel below always stay in sync. */
export function ScaleExplorer({ variants, instrument }: ScaleExplorerProps) {
  const [root, setRoot] = useState<RootKey>("C");
  const variant = variants[0];

  // Defaults to the account's own instrument (set at onboarding, changeable
  // in Profile) but is a local, page-only view from here on — a guitar
  // student peeking at the piano layout, or vice versa, shouldn't require a
  // trip to Profile, and shouldn't silently overwrite their saved
  // preference either. Purely a viewing choice, by direct instruction.
  const [instrumentView, setInstrumentView] = useState(instrument);

  // One player for the whole explorer, not one per panel: there is a single
  // pair of speakers, so a chord and a scale run must be able to interrupt
  // each other. Two independent hooks would happily play over one another.
  // Voice-aware on `instrumentView` so switching it changes what you hear,
  // not just what you see.
  const player = useScalePlayer(instrumentView);

  // Changing key or instrument mid-run would leave a scale sounding in the
  // key (or voice) the user just navigated away from.
  useStopOnChange(player.stop, `${root}-${instrumentView}`);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <KeySelector value={root} onChange={setRoot} />
      </div>

      <TranspositionDashboard
        variant={variant}
        root={root}
        player={player}
        instrument={instrumentView}
        onInstrumentChange={setInstrumentView}
      />
      <ScaleChordsPanel variant={variant} root={root} player={player} />
    </div>
  );
}
