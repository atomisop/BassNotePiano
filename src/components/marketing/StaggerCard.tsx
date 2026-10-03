"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * A small fade+rise reveal for individual cards inside a grid, staggered by
 * `index` so a row of cards arrives one after another instead of all at
 * once — used for the pricing bundle cards. Separate from `ScrollGlassCard`
 * (which handles the larger, single glass panel per homepage section): this
 * is for the smaller items *inside* one of those panels.
 *
 * Plain client component, not `ScrollGlassCard` itself, because these cards
 * keep their own existing border/background styling rather than becoming
 * glass surfaces — only the entrance motion is shared in spirit, not the
 * material.
 */
export function StaggerCard({
  children,
  index = 0,
  className = "",
}: {
  children: ReactNode;
  index?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: "some", margin: "0px 0px 10% 0px" }}
      transition={{
        duration: reduced ? 0.25 : 0.45,
        delay: reduced ? 0 : index * 0.08,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
