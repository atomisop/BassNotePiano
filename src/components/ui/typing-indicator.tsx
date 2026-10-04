"use client";

// From 21st.dev (ddoemonn/typing-indicator): the bouncing-dot bubble plus a
// "Alex is typing" / "Alex and Sam are typing" label. Only the animation
// import (framer-motion, already in this app) and the colors (app tokens) are
// changed, and the demo-only presence hook is left out: the server tells us
// who is typing, so the names arrive as a plain list.
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "framer-motion";

const WAVE_MS = 1.25;

const SURFACE = { type: "spring", stiffness: 380, damping: 30, mass: 0.8 } as const;
const CROSSFADE = { type: "spring", stiffness: 260, damping: 34, mass: 0.8 } as const;
const EASE = [0.23, 1, 0.32, 1] as const;
const INSTANT = { duration: 0 } as const;

function describe(names: string[], max: number): string {
  if (names.length === 0) return "";

  const head = names.slice(0, Math.max(1, max));
  const rest = names.length - head.length;

  if (rest > 0) {
    return `${head.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"} are typing`;
  }
  if (head.length === 1) return `${head[0]} is typing`;

  return `${head.slice(0, -1).join(", ")} and ${head[head.length - 1]} are typing`;
}

function Dot({ index, wave, size }: { index: number; wave: MotionValue<number>; size: number }) {
  const lift = useTransform(wave, (w) => {
    let distance = (w - index) % 3;
    if (distance < 0) distance += 3;
    if (distance > 1.5) distance -= 3;
    return Math.max(0, 1 - Math.abs(distance));
  });

  const scale = useTransform(lift, [0, 1], [0.74, 1]);
  const opacity = useTransform(lift, [0, 1], [0.32, 1]);

  return <motion.span className="block rounded-full bg-slate-400" style={{ width: size, height: size, scale, opacity }} />;
}

export type TypingIndicatorProps = {
  typists: string[];
  max?: number;
  size?: number;
  showLabel?: boolean;
  announceAfter?: number;
  className?: string;
};

export function TypingIndicator({ typists, max = 2, size = 34, showLabel = true, announceAfter = 700, className = "" }: TypingIndicatorProps) {
  const reduced = useReducedMotion();

  const label = useMemo(() => describe(typists, max), [typists, max]);
  const active = typists.length > 0;

  const wave = useMotionValue(0);
  useEffect(() => {
    if (!active || reduced) {
      wave.jump(0);
      return;
    }
    const controls = animate(wave, 3, { duration: WAVE_MS, ease: "linear", repeat: Infinity, repeatType: "loop" });
    return () => controls.stop();
  }, [active, reduced, wave]);

  const [announced, setAnnounced] = useState(label);
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(label), announceAfter);
    return () => clearTimeout(timer);
  }, [label, announceAfter]);

  const width = Math.round(size * 2);
  const dot = Math.round(size * 0.23);
  const gap = Math.round(size * 0.15);
  const radius = Math.round(size * 0.47);

  return (
    <div className={`inline-flex max-w-full items-end gap-3 ${className}`} style={{ height: size }}>
      <div className="relative shrink-0" style={{ width, height: size }}>
        <AnimatePresence initial={false}>
          {active ? (
            <motion.div
              key="bubble"
              aria-hidden
              className="absolute inset-0 flex items-center justify-center bg-neu-base shadow-raised-low"
              style={{ borderRadius: radius, transformOrigin: "0% 100%", gap }}
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.74 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduced ? { opacity: 0, transition: INSTANT } : { opacity: 0, scale: 0.4, transition: { duration: 0.26, ease: EASE } }}
              transition={reduced ? INSTANT : { ...SURFACE, opacity: { duration: 0.18, ease: EASE } }}
            >
              {[0, 1, 2].map((i) =>
                reduced ? (
                  <span key={i} className="block rounded-full bg-slate-400 opacity-80" style={{ width: dot, height: dot }} />
                ) : (
                  <Dot key={i} index={i} wave={wave} size={dot} />
                ),
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {showLabel ? (
        <span className="grid min-w-0 flex-1" style={{ height: size * 0.6 }}>
          <AnimatePresence initial={false}>
            {label ? (
              <motion.span
                key={label}
                aria-hidden
                className="col-start-1 row-start-1 self-center truncate text-small text-slate-400"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 7 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -7 }}
                transition={reduced ? INSTANT : CROSSFADE}
              >
                {label}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
      ) : null}

      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announced}
      </span>
    </div>
  );
}

export default TypingIndicator;
