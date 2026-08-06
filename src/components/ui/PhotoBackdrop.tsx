"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

type Scrim = "light" | "standard" | "dense";

const SCRIM_CLASS: Record<Scrim, string> = {
  light: "backdrop-scrim-light",
  standard: "backdrop-scrim",
  dense: "backdrop-scrim-dense",
};

interface PhotoBackdropProps {
  src: string;
  /** Purely decorative — the scrim + glass above it carry all real content, so this stays out of the a11y tree. */
  scrim?: Scrim;
  /** Section-scoped backdrop that drifts slower than page scroll (marketing sections). Leave off for a static shell/auth backdrop. */
  parallax?: boolean;
  priority?: boolean;
  sizes?: string;
  className?: string;
}

/**
 * Full-bleed photographic backdrop + scrim, in one implementation every page
 * consumes instead of copy-pasting markup. Always renders `absolute inset-0`
 * — wrap it in a `fixed inset-0` container for a persistent shell/auth
 * backdrop, or a `relative` section for a marketing backdrop scoped to that
 * section.
 */
export function PhotoBackdrop({
  src,
  scrim = "standard",
  parallax = false,
  priority = false,
  sizes = "100vw",
  className = "",
}: PhotoBackdropProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const activeParallax = parallax && !prefersReducedMotion;
  const y = useTransform(scrollYProgress, [0, 1], activeParallax ? ["-6%", "6%"] : ["0%", "0%"]);

  return (
    <div ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <motion.div style={{ y }} className="absolute inset-[-6%]">
        <Image src={src} alt="" fill priority={priority} sizes={sizes} className="object-cover" />
      </motion.div>
      <div className={`absolute inset-0 ${SCRIM_CLASS[scrim]}`} />
      {/* Warm glow-smoke dissolve at both edges — see .backdrop-glow-smoke-*.
          Symmetric on purpose: this is what makes two stacked <PhotoBackdrop>
          sections blend into each other, not just this one fade to black. */}
      <div className="backdrop-glow-smoke-top absolute inset-x-0 top-0 h-1/2" />
      <div className="backdrop-glow-smoke-bottom absolute inset-x-0 bottom-0 h-2/3" />
    </div>
  );
}
