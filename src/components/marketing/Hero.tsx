"use client";

import { useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { QUIZ_PASS_THRESHOLD } from "@/lib/access";
import { ScrollFrameSequence } from "@/components/marketing/ScrollFrameSequence";

/**
 * HOMEPAGE REBUILD: the hero is now the piano scroll sequence itself, by
 * direct instruction, not a separate section that follows a plain static
 * hero. Same real content this file always had (badge, headline,
 * paragraph, CTAs), same real facts, just presented as the first beat
 * inside ScrollFrameSequence instead of its own standalone section.
 *
 * The sequence itself is deliberately just the lid opening now, cut before
 * any part of the piano separates from it (an earlier pass here ran the
 * full source through to a dramatic exploded-parts reveal; cut per direct
 * "I don't like it" feedback). public/piano-reveal/ holds exactly frames
 * 1-65 of that original source (the fully-exploded frames past that point,
 * along with the original wider-sampled 70-frame set, are deleted, not
 * just unused, since neither has a reason to stay in the repo).
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
 * MOUNTAIN is new: a soft hill silhouette sitting across the bottom of the
 * viewport at rest, covering the paragraph/CTA row (the headline itself
 * stays clear, above its ridge). The first few percent of scroll slides it
 * fully out of view, "rising up and over" it to reveal the rest of the
 * hero, per direct instruction ("a behind the mountain effect"). It's
 * `pointer-events: none` throughout, so the CTA underneath is genuinely
 * clickable even before that reveal happens, not just visually blocked.
 *
 * What's still gone, and stays gone: the demo-derived nav/logo/login-button
 * chrome this file never carried in the first place, the corner accent
 * treatment now living on the Atom assistant widget instead, and the old
 * live-WebGL 3D piano backdrop removed earlier this session, which this
 * baked-frame-sequence technique is not a reversal of.
 *
 * HUD ACCENT: a "cyber punkish" pass, by direct instruction, deliberately
 * scoped to a mood/technique borrow rather than a content one (a separate,
 * unrelated cyberpunk-armor product brief was explicitly rejected as
 * having "nothing to do with bassnotepiano" once built and reviewed). Two
 * additions, both using tokens and conventions this app already has rather
 * than importing a new palette or font:
 *   - Corner brackets around the badge pill: a targeting-reticle motif,
 *     the generic visual shorthand for "HUD", not specific to any one
 *     brand or product; four small SVG corner marks in the signal accent.
 *   - A specs readout row below the CTAs, in marketing.css's own `.label`
 *     voice (JetBrains Mono, uppercase, tracked) it already uses for
 *     eyebrows elsewhere on this page, just applied to a new row of real
 *     facts instead of a single eyebrow line. Signal green already reads
 *     as "vivid, neon-adjacent by design" per themes.css's own comment on
 *     that accent, which is most of why this works without a new palette.
 */
function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** How much of the sequence's own scroll progress the mountain's exit spans.
 * Short and early on purpose: this is meant to resolve almost as soon as
 * scrolling starts, well before TEXT_FADE_END (0.35 in ScrollFrameSequence)
 * even begins pulling the rest of this content away. */
const MOUNTAIN_REVEAL_END = 0.1;

export function Hero() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const mountainRef = useRef<HTMLDivElement>(null);

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
        basePath="/piano-reveal"
        frameCount={65}
        onProgress={(progress) => {
          const el = mountainRef.current;
          if (!el) return;
          const t = Math.min(1, progress / MOUNTAIN_REVEAL_END);
          // Eased (t*t, not linear) so it starts the slide slowly, giving the
          // very first pixels of scroll a moment to register as intentional
          // before the hill visibly moves, then accelerates away.
          const eased = t * t;
          el.style.transform = `translateY(${eased * 100}%)`;
          el.style.pointerEvents = "none";
        }}
        foreground={
          <div
            ref={mountainRef}
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[50vh] min-h-[340px] sm:h-[54vh]"
            style={{ pointerEvents: "none" }}
          >
            <svg
              viewBox="0 0 1440 600"
              preserveAspectRatio="none"
              className="h-full w-full"
              style={{ color: "rgb(var(--c-s-950))" }}
            >
              <path
                d="M0,600 L0,320 C 250,180 400,80 620,120 C 850,160 1000,60 1440,100 L1440,600 Z"
                fill="currentColor"
              />
            </svg>
          </div>
        }
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
        <div className="relative inline-block w-fit">
          {/* Corner brackets: a targeting-reticle motif around the badge,
              purely decorative (aria-hidden, pointer-events-none) and
              positioned slightly outside the pill's own box so it reads as
              a HUD frame around the badge rather than a border on it. */}
          <svg
            aria-hidden
            className="pointer-events-none absolute -inset-2.5 h-[calc(100%+20px)] w-[calc(100%+20px)] text-[rgb(var(--c-a-400))]"
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
          >
            <path d="M2 10V2h8" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M90 2h8v8" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M2 30v8h8" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M98 30v8h-8" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>

          <div
            className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm"
            style={{ filter: "url(#hero-glass-effect)" }}
          >
            <span className="text-sm font-medium tracking-wide text-white/90">
              Ethiopian Scales, Rhythm &amp; Chords
            </span>
          </div>
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

        {/* HUD specs readout: real facts, not decoration. Reuses
            marketing.css's own `.label` voice (mono, uppercase, tracked,
            signal accent) rather than a new font, in a row instead of a
            single eyebrow line. */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {[
            "6 kiñit scales",
            "12 keys",
            "Live 1:1 access",
            `${Math.round(QUIZ_PASS_THRESHOLD * 100)}% to advance`,
          ].map((fact) => (
            <span key={fact} className="label">
              {fact}
            </span>
          ))}
        </div>
      </ScrollFrameSequence>
    </>
  );
}
