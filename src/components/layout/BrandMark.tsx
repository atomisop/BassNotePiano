"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * The TopBar wordmark, once logged in — desktop only (`md:` and up), by
 * direct instruction. Below `md:` this renders exactly as it always has,
 * icon and text both permanently visible; there's no hover to trigger a
 * reveal on touch, so collapsing it there would just mean losing the brand
 * name with no way to get it back.
 *
 * At `md:` and up: collapsed to just the logo mark by default. Hovering
 * anywhere on the link (not just the 28px icon itself, "near" the logo,
 * not exactly on it) slides "Bass Note Piano" in from behind the icon;
 * moving away reverses it — the text slides back toward the icon and
 * shrinks slightly as it fades, reading as being drawn back into the mark
 * rather than a plain fade-out. Adapted from 21st.dev's "Expandable
 * Button" (icon-only collapsed / icon+label expanded, animated with
 * Framer Motion) — same enter/exit shape, re-triggered by hover here
 * instead of that component's click toggle, and without its pill/button
 * chrome since this sits directly on the transparent header, not inside a
 * colored button that needs its own width to animate.
 */
export function BrandMark() {
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useReducedMotion();

  return (
    <Link
      href="/"
      aria-label="Bass Note Piano, home"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-2.5"
    >
      <Image src="/logo-mark.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-[6px]" priority />

      {/* Below md: unchanged, always-visible text — no hover to drive a
          reveal on a touch device. Same wordmark treatment as MarketingNav's
          own (bold, lowercase, fully accent-colored) now, not the
          pre-Pianote-pass uppercase/split-color version this used to be. */}
      <span className="font-serif text-sm font-bold lowercase tracking-[-0.01em] text-[rgb(var(--c-a-400))] md:hidden">
        Bass Note Piano
      </span>

      {/* md and up: collapsed by default, slides out from the icon on
          hover. */}
      <span className="hidden md:inline-block">
        <AnimatePresence>
          {hovered && (
            <motion.span
              key="wordmark"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -14, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -14, scale: 0.85 }}
              transition={{ duration: reducedMotion ? 0.15 : 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="inline-block whitespace-nowrap font-serif text-sm font-bold lowercase tracking-[-0.01em] text-[rgb(var(--c-a-400))]"
            >
              Bass Note Piano
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </Link>
  );
}
