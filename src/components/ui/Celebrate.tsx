"use client";

import { useEffect, useState } from "react";

const PIECES = 28;
const COLORS = ["rgb(var(--signal))", "#f5f5f5", "#fbbf24", "#60a5fa", "#f472b6"];

/**
 * A short burst of confetti for a moment that deserves one (a finished practice day). Pure CSS, no library, hidden from assistive
 * tech, and not rendered at all for anyone who asks for reduced motion. Mount it when the moment happens; it removes itself.
 */
export function Celebrate({ onDone }: { onDone?: () => void }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => {
      setShow(false);
      onDone?.();
    }, 2000);
    return () => clearTimeout(t);
  }, [onDone]);
  if (!show) return null;
  return (
    <span aria-hidden className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      {Array.from({ length: PIECES }).map((_, i) => {
        const angle = (i / PIECES) * Math.PI * 2;
        const dist = 120 + ((i * 37) % 140);
        return (
          <span
            key={i}
            className="confetti-piece"
            style={
              {
                "--dx": `${Math.cos(angle) * dist}px`,
                "--dy": `${Math.sin(angle) * dist - 80}px`,
                "--rot": `${(i * 53) % 360}deg`,
                background: COLORS[i % COLORS.length],
                animationDelay: `${(i % 5) * 20}ms`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </span>
  );
}
