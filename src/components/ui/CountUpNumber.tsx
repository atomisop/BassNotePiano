"use client";

import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

/** Animates from 0 up to `value` once, on mount/when `value` changes. Jumps straight to the final value under `prefers-reduced-motion`. */
export function CountUpNumber({ value, className }: { value: number; className?: string }) {
  const prefersReducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(prefersReducedMotion ? value : 0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.7,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, prefersReducedMotion]);

  return <span className={className}>{display}</span>;
}
