"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Brief soft glow pulse (paper, never the signal green, which means
 * "tap this" only) for a "success" settle-in moment — quiz passed,
 * Zelle payment confirmed, booking confirmed. One shared visual language for
 * all of them (per the brief: reused, not reinvented per event).
 *
 * Render inside a `relative` (or already-positioned) ancestor that also has
 * `overflow-hidden` + rounded corners — this uses an INSET glow specifically
 * so it reads as light filling the card from within rather than an outset
 * halo that would get clipped by that overflow-hidden boundary.
 *
 * Renders nothing under `prefers-reduced-motion` — a static glow with no
 * pulse would just be visual noise without the motion it exists to provide.
 */
export function SuccessGlowPulse() {
  const prefersReducedMotion = useReducedMotion();
  if (prefersReducedMotion) return null;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ duration: 1.1, times: [0, 0.4, 1], repeat: 1, repeatDelay: 0.15 }}
      style={{ boxShadow: "inset 0 0 50px 4px rgb(var(--c-s-50) / 0.14)" }}
    />
  );
}
