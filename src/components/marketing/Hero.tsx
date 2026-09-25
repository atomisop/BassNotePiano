"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSession } from "next-auth/react";
import { QUIZ_PASS_THRESHOLD } from "@/lib/curriculum";
import { CheckIcon, ArrowRightIcon } from "@/components/ui/icons";

// Served from R2 (the same object storage the app already uses for lesson
// videos/avatars, see lib/storage.ts), not the Next.js public folder: 17MB
// is a lot of repo weight and app-server bandwidth for one background
// loop, and R2 has no egress fees. Uploaded once as a fixed, immutable key
// (the timestamp in the filename), the same convention storage.ts's own
// uploads already use.
const HERO_VIDEO_URL = "https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/marketing/1788454184967-hero-piano.mp4";

/**
 * HOMEPAGE REBUILD (premium/restrained pass): full replacement of the HUD
 * hero, by direct instruction ("completely different... learn what makes a
 * premium website very cool"). Studied two real, widely-regarded sites
 * directly (linear.app, masterclass.com) rather than working from a vague
 * idea of "premium": what both actually do is extreme restraint, not more
 * visual effects. Concretely: one massive, tight-leading headline; one
 * short supporting line; real evidence (a real product screenshot at
 * Linear, real instructor photography at MasterClass) used cinematically,
 * full-bleed, not boxed into a small frame; one CTA; almost no other color
 * or chrome. The HUD hero this replaces was the opposite of that (a
 * targeting-bracket badge, a floating specs panel, a corner product card,
 * a second accent-colored label row): all of it is gone, not toned down.
 *
 * VIDEO BACKGROUND: the full-bleed piano photo (frame-065.webp) that filled
 * this same slot is now a looping video instead, by direct instruction
 * ("replace it with this video and the video should just loop"). Muted,
 * autoplaying and playsInline so it starts on its own on every browser
 * (including iOS Safari, which otherwise blocks autoplay on unmuted or
 * non-inline video) and loops with no visible transport controls, same
 * absolute-fill/object-cover treatment and the same scrim gradient below
 * it the photo used. No custom font or palette: this uses marketing.css's own
 * .display-1 (already tuned for exactly this: its own comment reads
 * "hero, final CTA", and it already has the tight ~0.92 line-height a
 * confident headline needs) and .lead/.btn, the same tokens every other
 * section already uses, restraint being the whole point of this pass
 * rather than another bespoke visual system.
 *
 * The scrim is a plain bottom-anchored gradient into the page's own
 * ground color (--c-s-950), not a colored wash: enough for the text to
 * stay legible over the photo's brighter areas, nothing more.
 *
 * FACT GRID + SECOND CTA: structurally borrowed from pianote.com's own
 * hero (a real competitor, studied directly, including its actual
 * rendered design, not just its text), which runs a 2x2 checkmark-led
 * fact grid plus a solid-primary + outline-secondary CTA pair in this
 * same position. Not copied verbatim: Pianote's own facts name things
 * BNP doesn't actually have in the same form (its "Popular Songs" one
 * names a song-library model that's the direct opposite of this app's
 * real "spelling engine, not a song library" positioning), so this uses
 * only BNP's own already-verified facts (the same four this session's
 * earlier HUD hero used in its specs panel) and BNP's own established
 * secondary-CTA destination (#curriculum, the same one the pre-HUD hero
 * used), reusing the app's real .btn-secondary style and the same
 * CheckIcon component the rest of the app already uses instead of a
 * one-off checkmark glyph.
 *
 * Display type is now Baloo 2 (see layout.tsx's own comment), a bold
 * rounded Google Font chosen to match Pianote's own friendly, heavy-
 * weight display energy without reproducing its actual (non-Google,
 * licensed) typeface. Colors are this app's own accent and black — green
 * and black by the original direct instruction ("we will use mostly the
 * green and black"), now the Instagram-style purple/pink/orange accent
 * that replaced it (see themes.css's own "Accent" comment) — never
 * Pianote's actual coral-red-on-brown palette.
 *
 * COPY PASS: headline swapped from "The grammar of..." to "The best way
 * to learn...", and "kiñit" dropped from the lead/fact grid, both by
 * direct instruction: kiñit is the Amharic word for "scale", so "kiñit
 * scale" read as a redundant, unexplained-jargon phrase to a visitor who
 * doesn't already know the term (fixed sitewide, not just here: see
 * every other marketing/public-copy file touched in this same pass). The
 * primary CTA dropped its price in favor of a plain arrow, matching the
 * arrow already used on this app's other CTAs (FinalCTA, Discord links)
 * instead of inventing a new convention. The price still lives one click
 * away on /pricing and inside the accordion on Solution.tsx, so nothing
 * is hidden, it's just not repeated a third time on the page. The fact
 * grid grew from four items to six: "Native chords" and "Virtual
 * instruments" are both real, already-built features (Solution.tsx's own
 * "Chords built in, not bolted on" feature, and the real interactive
 * PianoKeyboard.tsx/Fretboard.tsx components used inside lessons), not
 * new claims invented for this grid.
 */
// Cool, on-brand synonyms for "best" in this exact slot, cycled on a
// timer by direct instruction: best -> only -> right -> the three below ->
// loop. The three additions lean into the app's actual positioning
// (correctness of the scale system, cultural fit, modern teaching) rather
// than generic hype adjectives.
const HERO_ROTATING_WORDS = ["best", "only", "right", "definitive", "authentic", "smartest"];
const HERO_WORD_INTERVAL_MS = 2000;

// Longest word above, in characters, plus a little slack. The headline
// uses `text-balance` across a `max-w-[18ch]` box, so swapping in a
// longer/shorter word here would otherwise nudge that balance calculation
// and re-wrap the *entire* h1 onto different lines every 2s. Reserving a
// constant slot keeps the sentence's line breaks fixed no matter which
// word is currently showing.
const HERO_ROTATING_WORD_SLOT = "11ch";

/**
 * Styled after 21st.dev's own "text rotate" genre of component, by direct
 * instruction, rather than this project's own plain crossfade: each letter
 * flips up into place on a slight per-letter delay instead of the whole
 * word fading in as one block. This sandbox has no network access to
 * 21st.dev itself (same restriction already hit on bassnotepiano.com/the
 * R2 CDN elsewhere in this app), so this reproduces that component genre's
 * actual choreography (per-character stagger, spring physics, clipped
 * vertical flip) from scratch rather than a byte-for-byte copy — the same
 * "adapt the reference's chemistry, not its literal file" precedent
 * already documented in button.tsx's own comment for its own 21st.dev
 * reference.
 *
 * `AnimatePresence mode="popLayout"`, not the default `"wait"`: `"wait"`
 * holds the incoming word until the outgoing one's exit (letters and all)
 * fully finishes, which reads as a dead gap between words, by direct
 * instruction ("remove that delay"). `"popLayout"` pops the exiting word
 * out of flow immediately so the next one enters at the same time,
 * closing that gap — which also makes the whole flip noticeably quicker
 * since exit and enter now overlap instead of running back to back. The
 * per-letter spring (stiffness 500 / damping 32) is tuned snappy for the
 * same reason: each word should land fast and then hold for the full
 * `HERO_WORD_INTERVAL_MS`, not visibly spend part of it settling in.
 *
 * `useReducedMotion` gates the interval itself, not just the per-letter
 * transition: marketing.css's own `prefers-reduced-motion` block only
 * forces CSS animations/transitions to their resting state, but this loop
 * is a JS `setInterval`, so it needs its own check, the same way
 * CountUpNumber.tsx does. Reduced motion renders the first word, plainly,
 * forever — "a complete, static composition," per that same stylesheet's
 * own comment, not a degraded version of the loop.
 *
 * The rotating word is `aria-hidden` and paired with a plain `sr-only`
 * rendering of the full, unanimated sentence (see the h1 below): a screen
 * reader announcing a new adjective every 2 seconds would be a WCAG 2.2.2
 * "moving content" problem, not a nice touch.
 */
function RotatingHeroWord() {
  const prefersReducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % HERO_ROTATING_WORDS.length);
    }, HERO_WORD_INTERVAL_MS);
    return () => clearInterval(id);
  }, [prefersReducedMotion]);

  // Same tree shape either way (rather than branching to a plain static
  // <span> under reduced motion): this app's global `<MotionConfig
  // reducedMotion="user">` (providers.tsx) is documented to collapse
  // spring transitions to their end state automatically, but empirically
  // that collapse doesn't reach a spring shared across a staggered
  // variants tree the way it does a component's own inline transition —
  // the letters were observed stuck at their hidden (opacity: 0) state
  // instead of snapping to visible. Computing a plain zero-duration
  // transition here directly sidesteps that instead of depending on it,
  // and freezing `index` at 0 (see the effect above) means AnimatePresence's
  // `key` never changes for a reduced-motion visitor, so there's only the
  // one instant mount, never a loop.
  const word = HERO_ROTATING_WORDS[prefersReducedMotion ? 0 : index];
  const letterTransition = prefersReducedMotion ? { duration: 0 } : { type: "spring", damping: 32, stiffness: 500 };

  return (
    <span className="relative inline-block" style={{ minWidth: HERO_ROTATING_WORD_SLOT }}>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={word}
          className="inline-flex overflow-hidden"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={{
            visible: { transition: { staggerChildren: prefersReducedMotion ? 0 : 0.015 } },
            exit: { transition: { staggerChildren: prefersReducedMotion ? 0 : 0.01, staggerDirection: -1 } },
          }}
        >
          {word.split("").map((char, i) => (
            <motion.span
              key={i}
              className="inline-block"
              variants={{
                hidden: { y: "100%", opacity: 0 },
                visible: { y: 0, opacity: 1, transition: letterTransition },
                exit: { y: "-120%", opacity: 0, transition: letterTransition },
              }}
            >
              {char === " " ? " " : char}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function Hero() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    // min-h-[100svh], not min-h-screen (100vh): on a real phone, 100vh is
    // measured against the tallest the browser chrome ever gets (address
    // bar and toolbar both collapsed), not what's actually visible on
    // first load with both still expanded. That said: measured against a
    // real 390x664 mobile viewport, this section's own content (headline +
    // lead + fact grid + button row) already needed ~530-770px on its own —
    // taller than the viewport regardless of the vh/svh basis, so svh alone
    // didn't fix it; a first attempt at "push it up" that only *increased*
    // pb here made that worse, not better, since items-end aligns content
    // to the padding-box bottom regardless of min-height once content is
    // the taller constraint. The real fix is the 2-column fact grid above
    // (saved ~80px) plus trimming pb back down (pt stays: it's clearing the
    // fixed h-20 nav bar above, not padding to trim). Verified with a real
    // headless-browser render at 390x664 (not just reasoned about): the
    // section now renders at exactly the 664px viewport height — content
    // fits the min-height rather than overflowing it — with the button
    // row's bottom edge sitting a clear 48px above the fold.
    <section className="relative flex min-h-[100svh] items-end overflow-hidden pb-12 pt-28">
      <div className="absolute inset-0 -z-10">
        {/* pointer-events-none: this is pure background ambience, nothing to
            actually play/pause — autoPlay/muted/playsInline is the correct,
            complete set of attributes for reliable autoplay, but a visitor's
            own browser settings (iOS Low Power Mode in particular silently
            blocks autoplaying video regardless of those attributes, as a
            battery-saving measure this site has no business overriding) can
            still legitimately leave it paused. Without this, a tap anywhere
            on that open video area was reaching the raw <video> element and
            surfacing the browser's own default "tap to play" glyph right in
            the middle of the hero copy — reported live as "what's up with
            the play button?". Blocking pointer-events means there's no
            tappable target for the browser to offer that affordance on in
            the first place, so a blocked-autoplay visitor just sees the
            video's first frame sitting still, same as a static photo,
            instead of a stray, non-functional button. */}
        <video
          aria-hidden
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover pointer-events-none"
        >
          <source src={HERO_VIDEO_URL} type="video/mp4" />
        </video>
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgb(var(--c-s-950)) 0%, rgb(var(--c-s-950) / 0.75) 30%, rgb(var(--c-s-950) / 0.15) 65%, transparent 100%)",
          }}
        />
      </div>

      <div className="mx-auto w-full max-w-4xl px-6">
        <h1 className="display-1 max-w-[18ch] text-balance">
          <span aria-hidden="true">
            The <RotatingHeroWord /> way to learn Ethiopian music.
          </span>
          <span className="sr-only">The best way to learn Ethiopian music.</span>
        </h1>
        <p className="lead mt-6 max-w-lg text-slate-300">15 scales, spelled correctly in every key.</p>

        {/* grid-cols-2 unconditionally, not grid-cols-1 below sm: stacked
            into one column, this list alone was 160px tall on a real phone
            (measured against a 390x664 viewport) — the single biggest
            contributor to the hero's content needing more height than a
            short phone screen actually has, worse than the min-h-[100svh]/
            padding tuning below could fix on their own. Two columns halves
            that to ~80px; six short check-marked facts read fine at ~160px
            per column even at this width. */}
        <div className="mt-6 grid max-w-md grid-cols-2 gap-x-6 gap-y-2">
          {[
            "15 scales",
            "12 keys",
            "Live 1:1 teacher",
            `${Math.round(QUIZ_PASS_THRESHOLD * 100)}% quiz gate`,
            "Native chords",
            "Virtual instruments",
          ].map((fact) => (
            <span key={fact} className="flex items-center gap-2 text-sm text-slate-300">
              <CheckIcon className="shrink-0 text-[rgb(var(--c-s-50))]" size={14} />
              {fact}
            </span>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link href={isLoggedIn ? "/dashboard" : "/register"} className="btn btn-primary">
            {isLoggedIn ? "Go to dashboard" : "Start learning"}
            <ArrowRightIcon size={16} />
          </Link>
          <a href="#curriculum" className="btn btn-secondary">
            Explore curriculum
          </a>
        </div>
      </div>
    </section>
  );
}
