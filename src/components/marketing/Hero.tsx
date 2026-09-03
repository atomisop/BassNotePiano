"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useSession } from "next-auth/react";
import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";

/**
 * HOMEPAGE REPLACEMENT — 01 HERO, third pass.
 *
 * First pass was fully static (no shader, no motion beyond hover) — the
 * user's own original spec asked for that explicitly. Second pass reversed
 * that call for the hero specifically: real shader/motion effects, recolored
 * into Bass Note's own palette with real content. This pass moves the mesh
 * gradient itself out of this file entirely — the user asked for that
 * background to extend the full homepage, not just this section, so it now
 * lives in `PageBackground.tsx`, mounted once above every section. This
 * file keeps only what's genuinely hero-specific: the badge/headline/
 * paragraph/CTA content.
 *
 * What changed from ShaderShowcase's own colors/content:
 *  - Mesh gradient (now in `PageBackground.tsx`): cyan/orange/white → warm
 *    black/walnut/rust/amber, this app's own tokens' real computed values.
 *  - Badge pill / headline / paragraph / CTA labels: the real, existing
 *    Bass Note hero copy (same text `HeroScene.tsx` used), not the demo's
 *    "New Paper Shaders Experience" / "Beautiful Shader Experiences".
 *  - Dropped entirely: the demo's own inline logo+nav+gooey-login-button
 *    header row. This site already has a real, sitewide sticky nav
 *    (`MarketingNav`, adapted from `header-2`) — duplicating a second nav
 *    inside the hero would mean two navigation bars stacked on load.
 *  - Dropped: the hover-triggered logo sparkle-particle effect (there's no
 *    duplicate logo here to hang it on) and the gooey gravitational login
 *    button (same reason). Also dropped: the on-screen piano image the
 *    original homepage used here — removed per direct instruction.
 *  - Dropped: the corner PulsingBorder + rotating-brand-text accent this
 *    section used to carry on its own — the Atom assistant widget
 *    (AssistantWidget.tsx) now uses that same shader treatment as its real,
 *    functional launcher button, and having a second, purely decorative
 *    copy of it elsewhere on the page read as confusing/redundant next to
 *    it, per direct instruction.
 */

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function Hero() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const reduced = useReducedMotion();

  return (
    <section className="relative min-h-[92vh] overflow-hidden">
      {/* SVG filter — glass-effect for the badge pill. Generic effect filter
          (no content baked in), kept from ShaderShowcase as-is. */}
      <svg className="absolute inset-0 h-0 w-0">
        <defs>
          <filter id="hero-glass-effect" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence baseFrequency="0.005" numOctaves="1" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.3" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0.02 0 1 0 0 0.02 0 0 1 0 0.05 0 0 0 0.9 0"
              result="tint"
            />
          </filter>
        </defs>
      </svg>

      {/* No local background/gradient/scrim here anymore — `PageBackground`
          (mounted once in `LandingPage`, fixed behind the whole page) now
          supplies all of it, including the readability scrim this section
          used to carry on its own. */}

      <div className="relative z-10 mx-auto flex min-h-[92vh] max-w-7xl flex-col justify-end px-6 pb-20 pt-32 md:pb-28">
        <motion.div
          className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm"
          style={{ filter: "url(#hero-glass-effect)" }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0.3 : 0.6, delay: 0.1 }}
        >
          <span className="text-sm font-medium tracking-wide text-white/90">
            Ethiopian Scales, Rhythm &amp; Chords
          </span>
        </motion.div>

        <motion.h1
          className="mt-6 text-6xl font-bold leading-none tracking-tight text-white md:text-7xl lg:text-8xl"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0.3 : 0.7, delay: 0.25 }}
        >
          <span className="mb-2 block text-4xl font-light tracking-wide text-[rgb(var(--c-a-300))] md:text-5xl lg:text-6xl">
            The grammar of
          </span>
          <span className="block font-black text-white">Ethiopian</span>
          <span className="block font-light italic text-white/80">music.</span>
        </motion.h1>

        <motion.p
          className="mt-6 max-w-xl text-lg font-light leading-relaxed text-white/70"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0.3 : 0.6, delay: 0.45 }}
        >
          Six kiñit scales (Tizita, Bati, Anchihoye, Mixolydian, and more), spelled correctly in
          all twelve keys, for piano and guitar. No years of music theory required first.
        </motion.p>

        <motion.div
          className="mt-8 flex flex-wrap items-center gap-4"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0.3 : 0.6, delay: 0.6 }}
        >
          <Link
            href={isLoggedIn ? "/dashboard" : "/register"}
            className="btn btn-primary"
          >
            {isLoggedIn ? "Go to dashboard" : `Start learning for ${formatUsd(CURRICULUM_PRICE_CENTS)}`}
          </Link>
          <a href="#curriculum" className="btn btn-secondary">
            Explore Curriculum
          </a>
        </motion.div>
      </div>
    </section>
  );
}
