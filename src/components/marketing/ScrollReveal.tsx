"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * REDESIGN: replaces ScrollGlassCard's animation half. Sections no longer
 * wrap themselves in a glass card by default: marketing.css's own
 * "STRUCTURE" comment already specified this before any of these sections
 * existed: "Rules, not boxes... this system states hierarchy with position,
 * scale and a hairline. A card is reserved for the product reveal, where a
 * bounded surface is literally what is being shown." The homepage rebuild
 * used a glass-surface card on every single section instead, which is
 * exactly the pattern that comment was written to rule out. A section that
 * genuinely shows a bounded surface (Solution's screenshot panel) still
 * uses glass-surface directly, on just that one element, not the whole
 * section.
 *
 * Triggers as soon as ANY part of the block is within 12% of the viewport's
 * bottom edge (`amount: "some"` plus a positive bottom margin), not once 30% of
 * it is visible: a tall section block needs well over half a screen of scroll
 * to reach 30%, which read as content that only appeared after you were
 * already past the middle of it.
 *
 * The fade-and-rise itself is unchanged from ScrollGlassCard: `whileInView`
 * + `viewport={{ once: true }}` because these sections sit well below the
 * first viewport, so animating on mount would finish before a visitor
 * scrolls anywhere near them.
 *
 * `data-scene-content` is marketing.css's own existing hook, not a new
 * convention: its `prefers-reduced-motion` block already resets
 * opacity/transform/filter to their resting state on anything carrying it,
 * so reduced motion is handled centrally in CSS rather than reimplemented
 * with a `useReducedMotion()` check in every component that animates.
 *
 * Duration/easing/travel distance are plain numbers, not `var(--dur-enter)`
 * etc., because Framer Motion's transition props need real values, not CSS
 * custom properties, but they're the exact values those tokens hold
 * (`--dur-enter: 800ms`, `--ease-out-expo`, `--travel: 24px`), kept in sync
 * by hand rather than computed, the same way ScrollGlassCard's own numbers
 * always were.
 */
export function ScrollReveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      data-scene-content
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: "some", margin: "0px 0px 12% 0px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
