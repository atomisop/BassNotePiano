"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Content that spawns in from the screen edge and fades up as it enters view.
 *
 * Direction is meaningful, not random: a block anchored to the left margin
 * enters from the left, so the motion reads as the element arriving at its
 * own position rather than sliding across the composition. Everything travels
 * a short distance — 44px — because a long slide draws attention to the
 * animation instead of to what arrived.
 *
 * The easing is expo-out, cubic-bezier(0.16, 1, 0.3, 1): almost all of the
 * distance is covered in the first third of the duration, so the element
 * feels like it was already in motion and is settling, rather than starting
 * from rest. That is what separates "premium" motion from a linear slide.
 *
 * Under `prefers-reduced-motion` the travel and blur are dropped entirely and
 * only a short opacity fade remains — position never animates.
 */

const EXPO_OUT = [0.16, 1, 0.3, 1] as const;

export interface RevealFromSideProps {
  children: ReactNode;
  /** Which edge the content arrives from. `up` is a plain rise, for centred blocks. */
  from?: "left" | "right" | "up";
  /** Seconds of delay, for staggering siblings. */
  delay?: number;
  /** Travel distance in px. */
  distance?: number;
  className?: string;
  /** Replay each time it scrolls into view instead of only the first time. */
  repeat?: boolean;
}

export function RevealFromSide({
  children,
  from = "left",
  delay = 0,
  distance = 44,
  className,
  repeat = false,
}: RevealFromSideProps) {
  const reduced = useReducedMotion();

  const offset =
    from === "left" ? { x: -distance, y: 0 } : from === "right" ? { x: distance, y: 0 } : { x: 0, y: distance };

  if (reduced) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: !repeat, margin: "-12% 0px" }}
        transition={{ duration: 0.28 }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, ...offset, filter: "blur(7px)" }}
      whileInView={{ opacity: 1, x: 0, y: 0, filter: "blur(0px)" }}
      viewport={{ once: !repeat, margin: "-12% 0px" }}
      transition={{ duration: 0.85, delay, ease: EXPO_OUT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Staggers a list of children through <RevealFromSide>, alternating the edge
 * they arrive from so a column of blocks reads as assembling rather than as
 * one repeated slide.
 */
export function RevealGroup({
  children,
  from = "left",
  stagger = 0.09,
  alternate = false,
  className,
}: {
  children: ReactNode[];
  from?: "left" | "right" | "up";
  stagger?: number;
  alternate?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <RevealFromSide
          key={i}
          from={alternate ? (i % 2 === 0 ? "left" : "right") : from}
          delay={i * stagger}
        >
          {child}
        </RevealFromSide>
      ))}
    </div>
  );
}
