"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { collapseVariants } from "@/lib/motionTokens";

/**
 * Animated show/hide for a section that expands in place. Replaces the bare
 * `{open && <div/>}` pattern, which makes content (and everything below it)
 * jump. Height and opacity ease together, so you can see what moved.
 * Reduced motion is handled by the app-wide MotionConfig.
 */
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="collapse"
          variants={collapseVariants}
          initial="closed"
          animate="open"
          exit="closed"
          style={{ overflow: "hidden" }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
