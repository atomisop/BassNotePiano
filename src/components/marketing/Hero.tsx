"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { QUIZ_PASS_THRESHOLD } from "@/lib/access";
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
export function Hero() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <section className="relative flex min-h-screen items-end overflow-hidden pb-20 pt-32 sm:pb-28">
      <div className="absolute inset-0 -z-10">
        <video
          aria-hidden
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover"
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
          The best way to learn Ethiopian music.
        </h1>
        <p className="lead mt-6 max-w-lg text-slate-300">Six scales, spelled correctly in every key.</p>

        <div className="mt-6 grid max-w-md grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {[
            "6 scales",
            "12 keys",
            "Live 1:1 teacher",
            `${Math.round(QUIZ_PASS_THRESHOLD * 100)}% quiz gate`,
            "Native chords",
            "Virtual instruments",
          ].map((fact) => (
            <span key={fact} className="flex items-center gap-2 text-sm text-slate-300">
              <CheckIcon className="shrink-0 text-[rgb(var(--c-a-400))]" size={14} />
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
