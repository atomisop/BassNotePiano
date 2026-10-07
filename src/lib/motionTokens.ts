import type { Transition, Variants } from "framer-motion";

/**
 * One set of motion values for the whole app, so every element that appears,
 * moves or leaves feels like it belongs to the same iOS-style system. The CSS
 * side reads the same curve from `--ease-ios` and the durations from
 * `--dur-fast / --dur-base / --dur-slow` in globals.css.
 */

/** The iOS ease-out curve, matching `--ease-ios`. */
export const EASE_IOS = [0.32, 0.72, 0, 1] as const;

/** Critically damped springs: no wobble, just a soft landing. */
export const SPRING = {
  /** Small things: popovers, banners, chevrons, toggles. */
  snappy: { type: "spring", bounce: 0, duration: 0.3 } satisfies Transition,
  /** Panels, sheets, expanding sections. */
  smooth: { type: "spring", bounce: 0, duration: 0.42 } satisfies Transition,
  /** A touch of life for celebratory moments only. */
  lively: { type: "spring", bounce: 0.25, duration: 0.5 } satisfies Transition,
};

/** Fades that go with a spring (opacity should not overshoot). */
export const FADE: Transition = { duration: 0.2, ease: EASE_IOS };

/** Expand/collapse: height and opacity together, with a soft fade. */
export const collapseVariants: Variants = {
  open: { height: "auto", opacity: 1, transition: { height: SPRING.smooth, opacity: { ...FADE, delay: 0.04 } } },
  closed: { height: 0, opacity: 0, transition: { height: SPRING.smooth, opacity: FADE } },
};

/** A floating menu that grows out of its trigger. */
export const popoverVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -6 },
  visible: { opacity: 1, scale: 1, y: 0, transition: SPRING.snappy },
  exit: { opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.14, ease: EASE_IOS } },
};
