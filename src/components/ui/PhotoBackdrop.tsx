"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

type Scrim = "light" | "standard" | "dense" | "vignette" | "minimal";

const SCRIM_CLASS: Record<Scrim, string> = {
  light: "backdrop-scrim-light",
  standard: "backdrop-scrim",
  dense: "backdrop-scrim-dense",
  // Shaped, not just weighted — see the two extra classes in globals.css for
  // why these exist alongside the three flat washes above.
  vignette: "backdrop-scrim-vignette",
  minimal: "backdrop-scrim-minimal",
};

interface PhotoBackdropProps {
  src: string;
  /** Purely decorative — the scrim + surfaces above it carry all real content, so this stays out of the a11y tree. */
  scrim?: Scrim;
  /** Section-scoped backdrop that drifts slower than page scroll (marketing sections). Leave off for a static shell/auth backdrop. */
  parallax?: boolean;
  priority?: boolean;
  sizes?: string;
  className?: string;
}

/**
 * The photo itself, with the load handled explicitly.
 *
 * Navigating to a page used to leave this area empty until the image
 * decoded, then snap it in — the "background pops in a second late" effect.
 * Two things fix that, and both are needed:
 *
 *   1. The wrapper is painted in the page ground colour, so before the photo
 *      arrives the area already looks like the finished page rather than a
 *      hole. Nothing visibly "appears" where there was blankness.
 *   2. The photo fades up over 700ms once decoded instead of swapping in on
 *      one frame, so even a genuinely slow load reads as the image settling
 *      rather than a flash.
 *
 * Cached images fire onLoad effectively immediately, so a revisit still
 * looks instant — the fade only shows itself when there's a real wait.
 */
function BackdropImage({ src, priority, sizes }: { src: string; priority: boolean; sizes: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      src={src}
      alt=""
      fill
      priority={priority}
      sizes={sizes}
      onLoad={() => setLoaded(true)}
      className={`object-cover transition-opacity duration-700 ease-out ${loaded ? "opacity-100" : "opacity-0"}`}
    />
  );
}

function ParallaxImage({ src, priority, sizes }: { src: string; priority: boolean; sizes: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["-6%", "6%"]);

  return (
    <motion.div ref={ref} style={{ y, willChange: "transform" }} className="absolute inset-[-6%]">
      <BackdropImage src={src} priority={priority} sizes={sizes} />
    </motion.div>
  );
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
  const prefersReducedMotion = useReducedMotion();
  // Every non-marketing page (the whole dashboard shell, auth, classes,
  // pricing) renders this with parallax off — those callers used to still
  // pay for a permanent useScroll() listener + per-frame transform write
  // that only ever produced "0%, unchanged". Skipping useScroll entirely
  // when parallax is off removes that dead scroll listener from every page
  // it's not needed on, instead of just clamping its output to a no-op.
  const activeParallax = parallax && !prefersReducedMotion;

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden bg-slate-950 ${className}`}>
      {activeParallax ? (
        <ParallaxImage src={src} priority={priority} sizes={sizes} />
      ) : (
        <div className="absolute inset-[-6%]">
          <BackdropImage src={src} priority={priority} sizes={sizes} />
        </div>
      )}
      <div className={`absolute inset-0 ${SCRIM_CLASS[scrim]}`} />
      {/* Warm glow-smoke dissolve at both edges — see .backdrop-glow-smoke-*.
          Symmetric on purpose: this is what makes two stacked <PhotoBackdrop>
          sections blend into each other, not just this one fade out. */}
      <div className="backdrop-glow-smoke-top absolute inset-x-0 top-0 h-1/2" />
      <div className="backdrop-glow-smoke-bottom absolute inset-x-0 bottom-0 h-2/3" />
    </div>
  );
}
