"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE_IOS } from "@/lib/motionTokens";

/**
 * Crossfades an icon that changes state (copy to check, play to pause) with a little scale and blur, so the swap reads as one thing
 * turning into another (revamp rule 18). `state` is any key that changes when the icon should. Enter is 160 ms, exit 128 (rule 15).
 * Reduced motion is handled by the app-wide MotionConfig (transforms off, opacity stays).
 */
export function IconSwap({ state, children, className }: { state: string | number | boolean; children: ReactNode; className?: string }) {
  return (
    <span className={className} style={{ position: "relative", display: "inline-flex" }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(state)}
          style={{ display: "inline-flex" }}
          initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.16, ease: EASE_IOS } }}
          exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)", transition: { duration: 0.128, ease: EASE_IOS } }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
