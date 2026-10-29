"use client";

import * as React from "react";
import { GlassLens } from "@/components/ui/GlassLens";

/**
 * A row of round glass buttons that behave like drops of liquid: while one is pressed, the row draws together and the neighbors' glass
 * flows into it (a merged blob behind them), then they spring apart again. The blob is a second, hidden-from-everything copy of the row
 * (plain circles run through a "goo" filter: blur, then a hard alpha threshold) sitting behind the real buttons; every real button keeps
 * its own lens and its own click. Give it round buttons of the same size.
 */
export function GlassBubbles({ size = 40, gap = 10, children, className = "" }: { size?: number; gap?: number; children: React.ReactNode; className?: string }) {
  const items = React.Children.toArray(children);
  const [merged, setMerged] = React.useState(false);
  const id = React.useId().replace(/:/g, "");
  const gapPx = merged ? 2 : gap;
  const row = { display: "flex", alignItems: "center", gap: gapPx, transition: "gap 380ms cubic-bezier(0.2, 1.15, 0.3, 1)" } as const;
  const release = () => setMerged(false);
  return (
    <div
      className={`relative inline-flex ${className}`}
      onPointerDown={() => setMerged(true)}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
    >
      <svg width="0" height="0" className="absolute" aria-hidden>
        <filter id={`goo-${id}`}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </svg>
      {/* The merged blob: the same row, as plain shapes, under the real buttons. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.2]" style={{ ...row, filter: `url(#goo-${id})` }}>
        {items.map((_, i) => (
          <span key={i} className="block shrink-0 rounded-full bg-white" style={{ width: size, height: size }} />
        ))}
      </div>
      <div className="relative" style={row}>
        {items.map((child, i) => (
          <span key={i} className="lg-ring relative inline-flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size }}>
            <GlassLens radius="full" bezel={Math.round(size * 0.32)} strength={Math.round(size * 0.3)} />
            <span className="relative z-10 flex h-full w-full items-center justify-center [&>*]:h-full [&>*]:w-full [&>*]:rounded-full">{child}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
