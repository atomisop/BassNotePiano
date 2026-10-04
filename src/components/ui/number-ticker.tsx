"use client";

// Adapted from 21st.dev (danielpetho/basic-number-ticker): a motion value
// tweened with `animate` and rendered through a rounding transform. Two
// changes for this app: it counts from whatever is currently on screen to the
// new value each time `value` changes (the original restarts from a fixed
// `from`), and it takes a `format` so prices keep their $ and cents. Skips the
// motion under prefers-reduced-motion.
import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

const defaultFormat = (n: number) => String(Math.round(n));

export function NumberTicker({
  value,
  format = defaultFormat,
  duration = 0.55,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const count = useMotionValue(value);
  const formatRef = useRef(format);
  formatRef.current = format;
  const text = useTransform(count, (latest) => formatRef.current(latest));

  useEffect(() => {
    if (reduced) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, { type: "tween", ease: "easeOut", duration });
    return () => controls.stop();
  }, [value, duration, reduced, count]);

  return <motion.span className={cn("tabular-nums", className)}>{text}</motion.span>;
}
