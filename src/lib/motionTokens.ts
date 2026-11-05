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

/** Revamp tokens, the TS side of the CSS ones in globals.css. */
export const POP_SCALE = 0.95;
export const MENU_MS = 180;
export const STAGGER_S = 0.03;
export const PRESS_SCALE = 0.97;
/** Ease-in-out for things already on screen that move (rule 9). */
export const EASE_MOVE = [0.65, 0, 0.35, 1] as const;

/** A floating menu that grows out of its trigger. Set `style={{ transformOrigin }}` at the trigger (rule 11). */
export const popoverVariants: Variants = {
  hidden: { opacity: 0, scale: POP_SCALE },
  visible: { opacity: 1, scale: 1, transition: { duration: MENU_MS / 1000, ease: EASE_IOS } },
  exit: { opacity: 0, scale: POP_SCALE, transition: { duration: (MENU_MS * 0.8) / 1000, ease: EASE_IOS } },
};
