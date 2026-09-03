"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { QUIZ_PASS_THRESHOLD } from "@/lib/access";

/**
 * HOMEPAGE REBUILD (HUD hero): full replacement of the piano-scroll hero,
 * by direct instruction, "use all of it except the picture," referring to
 * the UI (buttons, layout, specs panel, entrance/cursor-reveal animations)
 * from a fully-specified brief the user provided for a separate, unrelated
 * cyberpunk-armor product page. That page's fictional content and its
 * third-party character photo are gone; every structural/interaction
 * piece from its brief is reproduced here, with real Bass Note Piano
 * copy, real facts, and real photos of this app's own piano-reveal frames
 * standing in for the picture.
 *
 * Colors are the brief's exact orange/cream palette, by explicit direct
 * choice after being asked and warned this hero would then look visually
 * distinct from the black/signal-green rest of the page (SocialProof
 * through FinalCTA, all untouched by this file). That tradeoff is
 * deliberate, not an oversight.
 *
 * Scoped under .hud-hero (not the brief's own generic class names) so
 * nothing here leaks onto /classes, /pricing, /login, or any other route
 * sharing this app's <html>/<body> and marketing layout. Fonts (Orbitron-
 * Medium from a third-party CDN, Google Fonts Inter) are loaded via <link>
 * tags in (marketing)/page.tsx, a real Server Component, for the same
 * reason the earlier build used that approach: Next.js's automatic <head>
 * hoisting for <link>/<title> tags is documented for Server Components,
 * not reliably for Client Components like this one.
 *
 * This replaces the previous scroll-driven piano-opening sequence
 * (ScrollFrameSequence, the "mountain" reveal, the two-beat scroll-linked
 * text) with a single fixed-viewport hero and a cursor-driven reveal
 * instead: a different interaction model, not an enhancement of the old
 * one, per the brief's own single-viewport + mousemove design.
 * ScrollFrameSequence.tsx had no other caller and is deleted; the real
 * frame images it used (public/piano-reveal/) are reused here instead of
 * discarded, now as the two states of the cursor-spotlight reveal.
 */

const BASE_IMAGE_URL = "/piano-reveal/frame-001.webp";
const REVEAL_IMAGE_URL = "/piano-reveal/frame-065.webp";
const PRODUCT_THUMB_URL = "/screenshots/dashboard.png";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const HUD_HERO_CSS = `
.hud-hero {
  /* Direct instruction: gold text, real black piano, not the brief's
     original orange/cream. Token names are unchanged from that first
     pass (--hh-cream, --hh-orange) since every rule below already
     references them correctly; only the values move to a gold palette,
     so this comment is the flag that "cream" now means "gold". */
  --hh-cream: #E8C874;
  --hh-muted: rgba(232, 200, 116, 0.72);
  --hh-label: rgba(232, 200, 116, 0.5);
  --hh-orange: #D4AF37;
  --hh-card: rgba(8, 8, 8, 0.62);
  background: #0a0a0a;
  color: var(--hh-cream);
  overflow-x: hidden;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
.hud-hero h1, .hud-hero h2, .hud-hero h3, .hud-hero .hh-heading-font {
  font-family: 'Orbitron-Medium', 'Arial Narrow', sans-serif;
  font-weight: 400;
  letter-spacing: 0.02em;
}

.hud-hero .hh-hero {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: #0a0a0a;
}

.hud-hero .hh-hero-base-img {
  position: absolute;
  inset: 0;
  z-index: 1;
  background-size: cover;
  background-position: center center;
  opacity: 0;
}
.hud-hero .hh-hero-image-animate {
  animation: hhHeroImageIn 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  animation-delay: 0.15s;
}
@keyframes hhHeroImageIn {
  from { opacity: 0; transform: scale(1.18); }
  to { opacity: 1; transform: scale(1); }
}

.hud-hero .hh-hero-reveal-img {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background-size: cover;
  background-position: center center;
  -webkit-mask-image: radial-gradient(circle 0px at -999px -999px, #fff, transparent);
  mask-image: radial-gradient(circle 0px at -999px -999px, #fff, transparent);
}

/* Scrim, not a color wash: direct instruction was to keep the piano's own
   real black color, not tint it. A neutral dark gradient protects text
   contrast against the photo's brighter areas (the lacquer's real
   highlights) without shifting its hue the way the first pass's orange
   mix-blend-mode overlay did. Same idea as marketing.css's own "scrim"
   system elsewhere in this app (a tinted layer over a real photo
   backdrop), just neutral instead of colored. */
.hud-hero .hh-hero-wash {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  background: linear-gradient(115deg, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.15) 45%, rgba(0, 0, 0, 0.45) 100%);
}

.hud-hero .hh-hero-ui {
  position: absolute;
  inset: 0;
  z-index: 8;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr auto;
  padding: 36px 44px 40px;
  /* MarketingNav (src/components/marketing/MarketingNav.tsx) is a real,
     shared, fixed-position nav bar this brief's original single-page
     design never accounted for; being position:fixed, it takes up no
     space in normal document flow, so without this, this hero's own
     headline/label would render directly underneath it. The background
     image stays full-bleed to y=0 regardless (only this text-content
     layer gets pushed down); ~112px clears the nav's real measured height
     with a little breathing room, since the nav has no opaque background
     until the page is scrolled ("lifted"), so the two would otherwise
     visibly collide as overlapping text, not just crowd each other. */
  padding-top: 112px;
  pointer-events: none;
}

.hud-hero .hh-hero-left {
  grid-column: 1;
  grid-row: 1 / -1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-start;
  gap: 28px;
  min-width: 0;
}

.hud-hero .hh-hero-copy {
  max-width: 520px;
  padding-right: 56px;
  pointer-events: auto;
}

.hud-hero .hh-hero-copy h1 {
  font-size: clamp(1.55rem, 3.6vw, 3.15rem);
  line-height: 1.05;
  text-transform: uppercase;
  color: var(--hh-cream);
  /* A soft gold-tinted glow plus a dark contrast shadow, not a gradient
     fill: this app's own craft guidelines flag gradient text as a
     default-avoid pattern, and a solid gold reads as "luxury" just as
     well here without needing one. */
  text-shadow: 0 0 32px rgba(212, 175, 55, 0.35), 0 2px 28px rgba(0, 0, 0, 0.4);
  margin: 0;
}

.hud-hero .hh-hero-copy p {
  margin-top: 18px;
  max-width: 340px;
  font-size: 13.5px;
  font-weight: 400;
  line-height: 1.55;
  color: var(--hh-muted);
}

.hud-hero .hh-icon-row {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}

.hud-hero .hh-icon-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid rgba(251, 219, 175, 0.55);
  background: transparent;
  color: var(--hh-cream);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background 0.25s ease, border-color 0.25s ease;
}
.hud-hero .hh-icon-btn:hover {
  background: rgba(251, 219, 175, 0.1);
  border-color: var(--hh-cream);
}

.hud-hero .hh-product-card {
  pointer-events: auto;
  width: min(320px, 100%);
  display: grid;
  grid-template-columns: 86px 1fr;
  grid-template-rows: auto auto;
  gap: 10px 14px;
  padding: 12px;
  border-radius: 18px;
  background: var(--hh-card);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(251, 219, 175, 0.08);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
}

.hud-hero .hh-product-thumb {
  grid-column: 1;
  grid-row: 1 / -1;
  width: 86px;
  min-height: 86px;
  border-radius: 12px;
  overflow: hidden;
  background-size: cover;
  background-position: top center;
}

.hud-hero .hh-product-body {
  grid-column: 2;
  grid-row: 1;
}
.hud-hero .hh-product-body h2 {
  font-size: 11px;
  line-height: 1.25;
  text-transform: uppercase;
  color: var(--hh-cream);
  margin: 0;
}
.hud-hero .hh-product-body p {
  margin-top: 6px;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--hh-muted);
}

.hud-hero .hh-cart-btn {
  grid-column: 2;
  grid-row: 2;
  justify-self: start;
  align-self: end;
  border: 1px solid var(--hh-cream);
  border-radius: 999px;
  padding: 7px 16px;
  font-size: 12px;
  font-weight: 500;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  color: var(--hh-cream);
  background: transparent;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
  text-decoration: none;
  display: inline-block;
}
.hud-hero .hh-cart-btn:hover {
  transform: translateY(-1px);
}

.hud-hero .hh-hero-page {
  position: absolute;
  top: 36px;
  right: 44px;
  font-size: 13px;
  letter-spacing: 0.08em;
  color: rgba(251, 219, 175, 0.78);
}

.hud-hero .hh-specs {
  grid-column: 2;
  grid-row: 3;
  justify-self: end;
  pointer-events: auto;
  width: min(340px, 100%);
}
.hud-hero .hh-specs h3 {
  font-size: 11px;
  text-transform: uppercase;
  margin: 0 0 14px;
  letter-spacing: 0.12em;
}
.hud-hero .hh-spec-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  padding: 7px 0;
}
.hud-hero .hh-spec-row + .hh-spec-row {
  border-top: 1px solid rgba(251, 219, 175, 0.12);
}
.hud-hero .hh-spec-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hh-label);
}
.hud-hero .hh-spec-value {
  font-size: 12.5px;
  color: var(--hh-cream);
  text-align: right;
  white-space: nowrap;
}

/* ---- Word pull-up entrance ------------------------------------------- */
.hud-hero .hh-pull-word {
  display: inline-block;
  opacity: 0;
  transform: translateY(20px);
}
.hud-hero .hh-pull-word:not(:last-child) {
  margin-right: 0.3em;
}
@keyframes hhWordPullUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.hud-hero .hh-words-visible .hh-pull-word {
  animation: hhWordPullUp 0.55s ease forwards;
}

/* ---- Fade-up-blur reveal ----------------------------------------------- */
.hud-hero .hh-fade-up-reveal {
  opacity: 0;
  transform: translateY(14px);
  filter: blur(8px);
}
@keyframes hhFadeUp {
  from { opacity: 0; transform: translateY(14px); filter: blur(8px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}
.hud-hero .hh-fade-up-reveal.hh-is-visible {
  animation: hhFadeUp 0.7s ease forwards;
}

@media (prefers-reduced-motion: reduce) {
  .hud-hero .hh-hero-image-animate,
  .hud-hero .hh-words-visible .hh-pull-word,
  .hud-hero .hh-fade-up-reveal.hh-is-visible {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
    filter: none !important;
  }
  .hud-hero .hh-hero-base-img,
  .hud-hero .hh-pull-word,
  .hud-hero .hh-fade-up-reveal {
    opacity: 1 !important;
    transform: none !important;
    filter: none !important;
  }
}

/* ---- Responsive --------------------------------------------------------- */
@media (max-width: 1024px) {
  .hud-hero .hh-hero-ui { padding: 32px 28px 36px; padding-top: 112px; }
  .hud-hero .hh-hero-page { top: 112px; right: 28px; }
  .hud-hero .hh-specs { width: min(300px, 100%); }
}

@media (max-width: 900px) {
  .hud-hero .hh-hero-ui { padding: 28px 22px 28px; padding-top: 112px; }
  .hud-hero .hh-hero-page { top: 112px; right: 22px; }
  .hud-hero .hh-hero-copy h1 { font-size: clamp(1.35rem, 7.2vw, 2.4rem); }
  .hud-hero .hh-hero-base-img, .hud-hero .hh-hero-reveal-img { background-position: 40% center; }
  .hud-hero .hh-specs { width: min(280px, 100%); }
}

@media (max-width: 768px) {
  .hud-hero .hh-hero-ui {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
    padding: max(24px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(28px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
    /* MarketingNav drops to its 80px mobile height (h-20) below the 768px
       breakpoint, per that component's own Tailwind classes; see the base
       .hh-hero-ui rule's comment for why this clearance exists at all. */
    padding-top: max(96px, env(safe-area-inset-top));
  }
  .hud-hero .hh-hero-left { grid-row: 1 / 3; gap: 24px; }
  .hud-hero .hh-hero-page { top: max(96px, env(safe-area-inset-top)); right: max(20px, env(safe-area-inset-right)); }
  .hud-hero .hh-specs { grid-column: 1; grid-row: 3; justify-self: stretch; width: 100%; margin-top: 8px; }
  .hud-hero .hh-hero-base-img, .hud-hero .hh-hero-reveal-img { background-position: 40% center; }
}

@media (max-width: 720px) {
  .hud-hero .hh-hero { height: auto; min-height: 100vh; min-height: 100dvh; }
  .hud-hero .hh-hero-ui {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-height: 100dvh;
    justify-content: flex-start;
    gap: 28px;
    padding: max(22px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
    padding-top: max(96px, env(safe-area-inset-top));
  }
  .hud-hero .hh-hero-left { display: flex; width: 100%; justify-content: flex-start; }
  .hud-hero .hh-hero-copy { max-width: 100%; padding-right: 48px; }
  .hud-hero .hh-hero-copy p { font-size: 12.5px; max-width: 100%; }
  .hud-hero .hh-product-card { width: 100%; }
  .hud-hero .hh-specs { width: 100%; margin-top: auto; padding-top: 4px; }
  .hud-hero .hh-spec-value { white-space: normal; }
  .hud-hero .hh-hero-base-img, .hud-hero .hh-hero-reveal-img { position: absolute; background-position: 40% center; }
}

@media (max-width: 480px) {
  .hud-hero .hh-hero-ui {
    gap: 22px;
    padding: max(18px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    padding-top: max(96px, env(safe-area-inset-top));
  }
  .hud-hero .hh-hero-page { font-size: 12px; }
  .hud-hero .hh-hero-copy h1 { font-size: clamp(1.1rem, 8.5vw, 1.65rem); }
  .hud-hero .hh-hero-copy p { font-size: 12px; margin-top: 14px; }
  .hud-hero .hh-icon-row { margin-top: 16px; gap: 8px; }
  .hud-hero .hh-icon-btn { width: 34px; height: 34px; }
  .hud-hero .hh-hero-left { gap: 22px; }
  .hud-hero .hh-product-card { grid-template-columns: 72px 1fr; gap: 8px 12px; padding: 10px; border-radius: 14px; }
  .hud-hero .hh-product-thumb { width: 72px; min-height: 72px; border-radius: 10px; }
  .hud-hero .hh-product-body h2 { font-size: 10px; }
  .hud-hero .hh-product-body p { font-size: 11px; }
  .hud-hero .hh-cart-btn { padding: 6px 14px; font-size: 11px; }
  .hud-hero .hh-specs h3 { font-size: 10px; margin-bottom: 10px; }
  .hud-hero .hh-spec-row { padding: 6px 0; gap: 10px; }
  .hud-hero .hh-spec-label, .hud-hero .hh-spec-value { font-size: 11px; }
}

@media (max-width: 360px) {
  .hud-hero .hh-hero-copy h1 { font-size: 1rem; }
  .hud-hero .hh-product-card { grid-template-columns: 64px 1fr; }
  .hud-hero .hh-product-thumb { width: 64px; min-height: 64px; }
}
`;

const SPEC_ROWS = [
  { label: "Scales", value: "6 Kinit Groups", delay: "1.2" },
  { label: "Keys", value: "All 12", delay: "1.3" },
  { label: "Access", value: "Live 1:1 Lessons", delay: "1.4" },
  { label: "Progress", value: `${Math.round(QUIZ_PASS_THRESHOLD * 100)}% Quiz Gate`, delay: "1.5" },
];

export function Hero() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const rootRef = useRef<HTMLDivElement>(null);
  const revealImgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // ---- 1. Cursor-spotlight image reveal --------------------------------
    function handlePointer(clientX: number, clientY: number) {
      const revealEl = revealImgRef.current;
      if (!revealEl) return;
      const rect = revealEl.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const w = window.innerWidth;
      const radius = w < 480 ? 120 : w < 720 ? 160 : 260;
      const mask = `radial-gradient(circle ${radius}px at ${x}px ${y}px, #fff 0%, #fff 40%, rgba(255,255,255,0.75) 60%, rgba(255,255,255,0.4) 75%, rgba(255,255,255,0.12) 88%, transparent 100%)`;
      revealEl.style.webkitMaskImage = mask;
      revealEl.style.maskImage = mask;
    }
    function onMouseMove(e: MouseEvent) {
      handlePointer(e.clientX, e.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      const touch = e.touches[0];
      if (touch) handlePointer(touch.clientX, touch.clientY);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });

    // ---- 2. Word-by-word split (guarded so it only ever runs once) ------
    root.querySelectorAll<HTMLElement>(".hh-words-pull-up").forEach((el) => {
      if (el.dataset.split) return;
      el.dataset.split = "true";

      const isH1WithLines =
        el.tagName === "H1" && el.children.length > 0 && Array.from(el.children).every((c) => c.tagName === "SPAN");

      if (isH1WithLines) {
        let wordIndex = 0;
        Array.from(el.children).forEach((lineEl) => {
          const line = lineEl as HTMLElement;
          line.classList.add("hh-pull-line");
          line.style.display = "block";
          const words = (line.textContent ?? "").trim().split(/\s+/).filter(Boolean);
          line.innerHTML = words
            .map((word) => {
              const span = `<span class="hh-pull-word" style="animation-delay:${(wordIndex * 0.1).toFixed(2)}s">${word}</span>`;
              wordIndex += 1;
              return span;
            })
            .join(" ");
        });
      } else {
        const words = (el.textContent ?? "").trim().split(/\s+/).filter(Boolean);
        el.innerHTML = words
          .map((word, i) => `<span class="hh-pull-word" style="animation-delay:${(i * 0.1).toFixed(2)}s">${word}</span>`)
          .join(" ");
      }
    });

    // ---- 3. Mount reveal via IntersectionObserver -------------------------
    if ("IntersectionObserver" in window) {
      const wordsObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("hh-words-visible");
              wordsObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.2 },
      );
      root.querySelectorAll(".hh-words-pull-up").forEach((el) => wordsObserver.observe(el));

      const fadeObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const target = entry.target as HTMLElement;
              target.style.animationDelay = `${target.dataset.delay ?? "0"}s`;
              target.classList.add("hh-is-visible");
              fadeObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15 },
      );
      root.querySelectorAll(".hh-fade-up-reveal").forEach((el) => fadeObserver.observe(el));
    } else {
      root.querySelectorAll(".hh-words-pull-up").forEach((el) => el.classList.add("hh-words-visible"));
      root.querySelectorAll(".hh-fade-up-reveal").forEach((el) => el.classList.add("hh-is-visible"));
    }

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return (
    <div className="hud-hero" ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: HUD_HERO_CSS }} />

      {/* A plain div, not <main>: LandingPage.tsx already wraps every
          section (this one included) in the page's one real <main
          id="main-content">, which is also the skip-link target. A second
          <main> nested inside it, with the same id, would be invalid HTML
          and would make that id ambiguous. */}
      <div className="hh-hero outline-none">
        <div
          className="hh-hero-base-img hh-hero-image-animate"
          style={{ backgroundImage: `url("${BASE_IMAGE_URL}")` }}
        />
        <div ref={revealImgRef} className="hh-hero-reveal-img" style={{ backgroundImage: `url("${REVEAL_IMAGE_URL}")` }} />
        <div aria-hidden className="hh-hero-wash" />

        <div className="hh-hero-ui">
          <div className="hh-hero-left">
            <div className="hh-hero-copy">
              <h1 className="hh-words-pull-up">
                <span>ETHIOPIAN //</span>
                <span>SCALE</span>
                <span>ENGINE</span>
              </h1>
              <p className="hh-fade-up-reveal" data-delay="0.5">
                Six kiñit scales (Tizita, Bati, Anchihoye, Mixolydian, and more), spelled correctly in all twelve
                keys, for piano and guitar. No years of music theory required first.
              </p>

              <div className="hh-icon-row hh-fade-up-reveal" data-delay="0.65">
                <button type="button" className="hh-icon-btn" aria-label="Curriculum">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <path d="M8 1.4L13.8 4.7V11.3L8 14.6L2.2 11.3V4.7L8 1.4Z" />
                    <circle cx="8" cy="8" r="1.35" fill="currentColor" stroke="none" />
                  </svg>
                </button>
                <button type="button" className="hh-icon-btn" aria-label="Roadmap">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <path d="M2 5.2V2h3.2" strokeLinecap="round" />
                    <path d="M14 5.2V2h-3.2" strokeLinecap="round" />
                    <path d="M2 10.8V14h3.2" strokeLinecap="round" />
                    <path d="M14 10.8V14h-3.2" strokeLinecap="round" />
                    <rect x="5.2" y="5.2" width="5.6" height="5.6" />
                  </svg>
                </button>
                <button type="button" className="hh-icon-btn" aria-label="Live lessons">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <path d="M9.2 1.6L4 9.1h3.5L6.8 14.4 12 6.9H8.5L9.2 1.6Z" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>

            <article className="hh-product-card">
              <div className="hh-product-thumb" aria-hidden style={{ backgroundImage: `url("${PRODUCT_THUMB_URL}")` }} />
              <div className="hh-product-body">
                <h2 className="hh-words-pull-up">Ethiopian Scales, Rhythm &amp; Chords</h2>
                <p className="hh-fade-up-reveal" data-delay="1.05">
                  The real method book this curriculum is built from, plus live 1:1 access to your teacher.
                </p>
              </div>
              <Link
                href={isLoggedIn ? "/dashboard" : "/register"}
                className="hh-cart-btn hh-fade-up-reveal"
                data-delay="1.15"
              >
                {isLoggedIn ? "Go to dashboard" : `Start for ${formatUsd(CURRICULUM_PRICE_CENTS)}`}
              </Link>
            </article>
          </div>

          <div className="hh-hero-page hh-fade-up-reveal" data-delay="0.75">
            Six Scales &middot; Twelve Keys
          </div>

          <div className="hh-specs">
            <h3 className="hh-words-pull-up">System Specs</h3>
            {SPEC_ROWS.map((row) => (
              <div key={row.label} className="hh-spec-row hh-fade-up-reveal" data-delay={row.delay}>
                <span className="hh-spec-label">{row.label}</span>
                <span className="hh-spec-value">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
