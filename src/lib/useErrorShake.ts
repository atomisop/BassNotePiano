"use client";

import { useEffect } from "react";
import { useAnimationControls, useReducedMotion } from "framer-motion";

const SHAKE_KEYFRAMES = [0, -8, 8, -6, 6, -3, 3, 0];

/**
 * Imperative shake trigger for a form validation error — pairs with a
 * conditional `border-red-400` flash on the relevant input(s), driven
 * directly off the same `error` value so it auto-clears the moment the
 * caller clears `error` (e.g. on the next keystroke).
 *
 * Apply the returned controls via `animate={controls}` on a `motion.form`/
 * `motion.div` wrapping the field(s) — does NOT drive entrance animation,
 * only fires the shake keyframes when `error` becomes truthy.
 */
export function useErrorShake(error: string | null) {
  const controls = useAnimationControls();
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!error || prefersReducedMotion) return;
    controls.start({ x: SHAKE_KEYFRAMES, transition: { duration: 0.4 } });
  }, [error, controls, prefersReducedMotion]);

  return controls;
}
