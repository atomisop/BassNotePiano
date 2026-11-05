"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EASE_IOS } from "@/lib/motionTokens";

/**
 * One quick pulse on the thing that succeeded (revamp rule 8): payment approved, class booked, practice done, saved. Change `pulseKey`
 * (a counter or the saved id) to fire it; the first render stays still. Scale only, 1 to 1.04 and back in 360 ms, no bounce. For a glow
 * inside a card keep using SuccessGlowPulse; this one moves the element itself.
 */
export function SuccessPulse({ pulseKey, children, className }: { pulseKey: string | number; children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      key={pulseKey}
      className={className}
      initial={false}
      animate={reduced ? undefined : { scale: [1, 1.04, 1] }}
      transition={{ duration: 0.36, times: [0, 0.45, 1], ease: EASE_IOS }}
    >
      {children}
    </motion.div>
  );
}
