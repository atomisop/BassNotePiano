"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE_IOS } from "@/lib/motionTokens";

/**
 * Reveals content with a `clip-path` wipe instead of a fade or a height tween (revamp rule 17): good for a badge changing, a panel
 * opening in place, or a color sweep. `from` is the edge it grows from. For plain expand and collapse of a section use Collapse.
 */
const HIDDEN = {
  top: "inset(0 0 100% 0)",
  bottom: "inset(100% 0 0 0)",
  left: "inset(0 100% 0 0)",
  right: "inset(0 0 0 100%)",
} as const;

export function MaskReveal({ show, from = "top", children, className }: { show: boolean; from?: keyof typeof HIDDEN; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          className={className}
          initial={{ clipPath: HIDDEN[from] }}
          animate={{ clipPath: "inset(0 0 0 0)", transition: { duration: 0.24, ease: EASE_IOS } }}
          exit={{ clipPath: HIDDEN[from], transition: { duration: 0.192, ease: EASE_IOS } }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
