"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const OFFSET = {
  up: { x: 0, y: 40 },
  left: { x: -56, y: 0 },
  right: { x: 56, y: 0 },
} as const;

/**
 * A real glass-surface card that slides and fades into place as it scrolls
 * into view — by direct, current instruction, for every homepage section
 * from "What Bass Note Is" down through the final CTA.
 *
 * `direction` picks which edge it slides in from ("up" = rises from below,
 * the original behavior; "left"/"right" = slides in from that side). Each
 * homepage section passes a different one so the page reads as an
 * alternating left/right/up rhythm while scrolling, rather than every
 * section arriving the same way.
 *
 * This deliberately reverses this homepage's own earlier rule ("deliberately
 * static, no scroll-triggered entrance animation anywhere on it" — see
 * FinalCTA's own history) the same way the hero's shader background earlier
 * reversed the original "no motion" spec for that one section: a later,
 * more specific instruction wins over an earlier general one, scoped to
 * exactly what was asked rather than applied everywhere by inference.
 *
 * `whileInView` + `viewport={{ once: true }}` rather than `animate`: these
 * sections are well below the first viewport, so animating on MOUNT (as the
 * rest of the app's entrance motion does) would mean they've already
 * finished animating off-screen before a visitor scrolls anywhere near
 * them — `whileInView` fires the animation exactly once, the moment each
 * card actually enters the viewport.
 */
export function ScrollGlassCard({
  children,
  className = "",
  direction = "up",
}: {
  children: ReactNode;
  className?: string;
  direction?: "up" | "left" | "right";
}) {
  const reduced = useReducedMotion();
  const offset = OFFSET[direction];

  return (
    <motion.div
      className={`glass-surface ${className}`}
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: offset.x, y: offset.y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: reduced ? 0.3 : 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
