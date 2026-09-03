"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { ScrollFrameSequence } from "@/components/marketing/ScrollFrameSequence";

/**
 * HOMEPAGE REBUILD: the hero is now the piano-explode scroll sequence
 * itself, by direct instruction, not a separate section that follows a
 * plain static hero. Same real content this file always had (badge,
 * headline, paragraph, CTAs), same real facts, just presented as the first
 * beat inside ScrollFrameSequence instead of its own standalone section.
 *
 * The individual motion.div mount-animations the previous version used
 * (fade+rise, staggered by delay) are gone: ScrollFrameSequence's own
 * textRef already owns this content's opacity/transform, driven by scroll
 * instead of mount, and a nested Framer Motion animation setting the same
 * CSS properties on a mount timer would fight that rather than combine
 * with it. Plain elements now; the parent supplies all the motion.
 *
 * secondChildren (see ScrollFrameSequence.tsx) is the second beat: it fades
 * in exactly as this content finishes fading out, tying the visual (the
 * piano opening to show its own structure) directly to the app's real
 * positioning elsewhere on the page (Solution.tsx's "spelling engine",
 * ProblemStatement's "grammar underneath") rather than being decorative.
 *
 * What's still gone, and stays gone: the demo-derived nav/logo/login-button
 * chrome this file never carried in the first place, the corner accent
 * treatment now living on the Atom assistant widget instead, and the old
 * live-WebGL 3D piano backdrop removed earlier this session, which this
 * baked-frame-sequence technique is not a reversal of.
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

  return (
    <>
      {/* SVG filter, glass-effect for the badge pill. No content baked in;
          reused as-is from this file's own earlier version. */}
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

      <ScrollFrameSequence
        basePath="/piano-explode"
        frameCount={70}
        secondChildren={
          <>
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.3em] text-white/70">Under the lid</p>
            <h2 className="max-w-2xl text-balance font-serif text-4xl leading-[1.1] text-white sm:text-5xl md:text-6xl">
              It isn&apos;t magic. It&apos;s a system.
            </h2>
            <p className="mt-5 max-w-md text-balance text-base leading-relaxed text-white/80 sm:text-lg">
              And a system can be learned, one real scale at a time.
            </p>
          </>
        }
      >
        <div
          className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm"
          style={{ filter: "url(#hero-glass-effect)" }}
        >
          <span className="text-sm font-medium tracking-wide text-white/90">
            Ethiopian Scales, Rhythm &amp; Chords
          </span>
        </div>

        <h1 className="mt-6 text-balance text-5xl font-bold leading-none tracking-tight text-white sm:text-6xl md:text-7xl">
          <span className="mb-2 block text-3xl font-light tracking-wide text-[rgb(var(--c-a-300))] sm:text-4xl md:text-5xl">
            The grammar of
          </span>
          <span className="block font-black text-white">Ethiopian</span>
          <span className="block font-light italic text-white/80">music.</span>
        </h1>

        <p className="mt-6 max-w-xl text-balance text-base font-light leading-relaxed text-white/70 sm:text-lg">
          Six kiñit scales (Tizita, Bati, Anchihoye, Mixolydian, and more), spelled correctly in
          all twelve keys, for piano and guitar. No years of music theory required first.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href={isLoggedIn ? "/dashboard" : "/register"} className="btn btn-primary">
            {isLoggedIn ? "Go to dashboard" : `Start learning for ${formatUsd(CURRICULUM_PRICE_CENTS)}`}
          </Link>
          <a href="#curriculum" className="btn btn-secondary">
            Explore Curriculum
          </a>
        </div>
      </ScrollFrameSequence>
    </>
  );
}
