"use client";

import * as React from "react";
import { GlassLens } from "@/components/ui/GlassLens";
import { cn } from "@/lib/utils";

const THUMB_W = 46;
const THUMB_H = 30;

/**
 * A range slider whose thumb is a pane of Liquid Glass: a clear pill that sits over the track and magnifies and bends the colored fill
 * beneath it, like the slider in Apple's own demos. It is a real <input type="range"> underneath (transparent, covering the whole control),
 * so dragging, the keyboard, screen readers and every existing onChange keep working exactly as before.
 */
export const GlassSlider = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & { value: number }>(function GlassSlider(
  { className, min = 0, max = 100, value, ...props },
  ref,
) {
  const lo = Number(min);
  const hi = Number(max);
  const pct = hi > lo ? Math.min(100, Math.max(0, ((value - lo) / (hi - lo)) * 100)) : 0;
  return (
    <div className={cn("relative h-11 w-full select-none", className)}>
      <span aria-hidden className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-neu-base shadow-pressed-low" />
      <span aria-hidden className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-signal" style={{ width: `calc(${pct}% - ${(pct / 100) * THUMB_W}px + ${THUMB_W / 2}px)` }} />
      <span
        aria-hidden
        className="lg-ring pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full transition-transform duration-150"
        style={{ width: THUMB_W, height: THUMB_H, left: `calc(${pct}% - ${(pct / 100) * THUMB_W}px)` }}
      >
        <GlassLens radius="full" bezel={11} strength={13} blur={0.8} tint="linear-gradient(180deg, rgb(255 255 255 / 0.2), rgb(255 255 255 / 0.06))" />
      </span>
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        value={value}
        {...props}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
});
