"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { WordsPullUp } from "@/components/ui/words-pull-up";
import { PillCTA } from "@/components/ui/pill-cta";
import { heroVideoAllowed } from "@/lib/heroVideo";
import { EASE_IOS } from "@/lib/motionTokens";

// Served from the site itself (Netlify's CDN), re-encoded 2026-10-31: the original was a 17 MB 4K HEVC file (HEVC does not even play
// in Chrome on many devices). Now H.264 at 1080p for computers (2.3 MB) and 720p for phones (1.2 MB), looking the same under the dark
// gradient and grain, plus a still poster so the first frame shows at once instead of a black box while the video loads.
const HERO_VIDEO_LARGE = "/marketing/hero-piano-1080.mp4";
const HERO_VIDEO_SMALL = "/marketing/hero-piano-720.mp4";
const HERO_POSTER = "/marketing/hero-piano-poster.webp";

/**
 * Keeps the background loop playing. autoPlay alone leaves it stopped on phones
 * in a few ordinary cases: iOS Low Power Mode and data-saver modes refuse to
 * autoplay until the person touches the page, and Safari pauses it when you
 * switch apps or tabs and does not always resume it. This asks it to play again
 * on load, when the tab becomes visible, and on the first touch, click, key
 * press or scroll, and quietly gives up if the browser still says no.
 */
function useKeepPlaying(ref: React.RefObject<HTMLVideoElement | null>, enabled: boolean) {
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (!enabled) {
      video.pause();
      return;
    }
    const tryPlay = () => {
      if (video.paused && document.visibilityState === "visible") void video.play().catch(() => {});
    };
    tryPlay();
    const onVisible = () => tryPlay();
    const gestures = ["touchstart", "pointerdown", "keydown", "scroll"] as const;
    const onGesture = () => tryPlay();
    video.addEventListener("pause", onGesture);
    video.addEventListener("stalled", onGesture);
    document.addEventListener("visibilitychange", onVisible);
    gestures.forEach((g) => window.addEventListener(g, onGesture, { passive: true }));
    return () => {
      video.removeEventListener("pause", onGesture);
      video.removeEventListener("stalled", onGesture);
      document.removeEventListener("visibilitychange", onVisible);
      gestures.forEach((g) => window.removeEventListener(g, onGesture));
    };
  }, [ref, enabled]);
}

type NetworkInfo = { saveData?: boolean; effectiveType?: string };

export function Hero() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const videoRef = useRef<HTMLVideoElement>(null);
  // The video plays right away. Only people who ask for less motion, have data saver on, or are
  // on a slow connection get it paused on its first frame instead of looping.
  const [motionAllowed, setMotionAllowed] = useState(true);
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInfo }).connection;
    setMotionAllowed(
      heroVideoAllowed({
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        saveData: Boolean(connection?.saveData),
        effectiveType: connection?.effectiveType ?? null,
      }),
    );
  }, []);
  useKeepPlaying(videoRef, motionAllowed);

  return (
    <section className="h-[100svh] w-full">
      <div className="relative h-full w-full overflow-hidden bg-black">
        {/* pointer-events-none: pure background, so a phone never offers its own tap-to-play glyph over the copy. */}
        <video
          ref={videoRef}
          aria-hidden
          autoPlay={motionAllowed}
          loop
          muted
          playsInline
          preload="metadata"
          poster={HERO_POSTER}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        >
          <source media="(min-width: 1024px)" src={HERO_VIDEO_LARGE} type="video/mp4" />
          <source src={HERO_VIDEO_SMALL} type="video/mp4" />
        </video>

        <div aria-hidden className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.7] mix-blend-overlay" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/75" />

        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-16 text-center md:pb-24">
          <h1 className="text-[clamp(3rem,11vw,8rem)] font-semibold leading-[0.95] tracking-display text-cream">
            <WordsPullUp text="Bass Note Piano" className="justify-center" />
          </h1>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5, ease: EASE_IOS }}
            className="mt-5 max-w-xl text-lg leading-snug text-cream/75 md:text-xl"
          >
            Ethiopian music, taught live. Piano, guitar and bass lessons with a real teacher, and a curriculum that opens one scale at a time.
          </motion.p>
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.7, ease: EASE_IOS }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <PillCTA href={isLoggedIn ? "/dashboard" : "/register"}>{isLoggedIn ? "Go to dashboard" : "Get started"}</PillCTA>
            <PillCTA href="/pricing" secondary>
              See pricing
            </PillCTA>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
