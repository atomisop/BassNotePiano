/**
 * Motion physics — the house style for anything that moves.
 *
 * Derived from Apple's *Designing Fluid Interfaces* (WWDC 2018). The through
 * line: motion should start from the current on-screen value, inherit the
 * user's velocity, project momentum forward, and stay grabbable mid-flight.
 *
 * ── Springs ──────────────────────────────────────────────────────────────
 * Apple replaced the physics triplet (mass/stiffness/damping) with two
 * designer-facing numbers: damping ratio and response. Framer Motion's
 * `bounce` + `duration` spring API is the same idea, so specify springs that
 * way rather than hand-tuning stiffness/damping — a raw pair silently encodes
 * a damping ratio nobody checked.
 *
 * For reference, ζ = damping / (2·√stiffness). The values this codebase used
 * before all landed between ζ 0.43 and 0.95 — every single spring overshot,
 * including menus and panels that no gesture ever touched.
 *
 * The rule: **critically damped (bounce 0) by default.** Overshoot is only
 * earned when the gesture itself carried momentum — a flick, a throw, a drag
 * release. A menu that merely faded in has no business bouncing.
 */

import type { Transition } from "framer-motion";

/**
 * Where a flick will come to rest, so a gesture can be snapped to the target
 * nearest its *projected* endpoint rather than to whatever it happened to be
 * over at release. This is what makes a small flick throw an element a long
 * way instead of nudging it one slot.
 *
 * This is Apple's exponential-decay form from the Fluid Interfaces sample
 * code — deliberately NOT the textbook v²/(2·decel), which decelerates on a
 * different curve and feels wrong next to native scrolling.
 *
 * @param velocity px/s at release
 * @param decelerationRate 0.998 ≈ normal scroll feel; 0.99 is snappier
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * Progressive resistance past a boundary. A hard stop reads as "frozen"; a
 * surface that keeps moving but gives less and less reads as "responsive, but
 * there's nothing more here."
 *
 * @param overshoot how far past the edge the pointer has travelled
 * @param dimension the size of the axis being dragged
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/**
 * Velocity from a short position history, rather than the last two points —
 * a single pair is dominated by whatever jitter landed in the final frame.
 * Samples older than `window` are ignored so a pause before release correctly
 * reads as zero velocity instead of averaging in the earlier movement.
 */
export interface PointerSample {
  value: number;
  time: number;
}

export function velocityFrom(samples: PointerSample[], window = 100): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.time - samples[i].time > window) break;
    first = samples[i];
  }
  const dt = last.time - first.time;
  if (dt <= 0) return 0;
  return ((last.value - first.value) / dt) * 1000;
}
