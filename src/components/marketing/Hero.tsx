"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { WordsPullUp } from "@/components/ui/words-pull-up";
import { GlitchText } from "@/components/ui/glitch-text";
import Link from "next/link";
import { PillCTA } from "@/components/ui/pill-cta";
import { ChevronRight } from "@/components/ui/appIcons";
import { heroVideoAllowed } from "@/lib/heroVideo";
import { EASE_IOS } from "@/lib/motionTokens";

// The original 4K file, served from R2 (the same object storage the app uses for lesson files and avatars, see lib/storage.ts).
// A smaller re-encode served from the site (2026-10-31) looked visibly softer, so the owner chose the original back (2026-11-01), and
// on every screen, phones and tablets included (2026-11-03, after a phone-only 720p copy had been added). It is HEVC (10-bit), which
// Firefox and many Windows and Android browsers cannot play, so those fall back to the 1080p H.264 copy. The still poster stays, so
// the first frame shows at once while the video loads.
const HERO_VIDEO_4K = "https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/marketing/1788454184967-hero-piano.mp4";
const HERO_VIDEO_1080 = "/marketing/hero-piano-1080.mp4";
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
          <source src={HERO_VIDEO_4K} type='video/mp4; codecs="hvc1.2.4.L150.B0"' />
          <source src={HERO_VIDEO_1080} type="video/mp4" />
        </video>

        <div aria-hidden className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.7] mix-blend-overlay" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/75" />

        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-16 text-center md:pb-24">
          <h1 className="text-[clamp(3rem,11vw,8rem)] font-semibold leading-[0.95] tracking-display text-cream">
            <WordsPullUp text="BNP" className="justify-center" />{" "}
            <GlitchText>STUDIO</GlitchText>
          </h1>
          {/* What this is, in the first line people read under the name; the details after it are quieter and smaller. */}
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5, ease: EASE_IOS }}
            className="mt-5 max-w-xl text-pretty"
          >
            <span className="block text-xl font-medium leading-snug text-cream md:text-2xl">Ethiopian music, taught live.</span>{" "}
            <span className="mt-2 block text-body leading-snug text-cream/70 md:text-lg">
              Piano, guitar and bass lessons with a real teacher, and a curriculum that opens one scale at a time.
            </span>
          </motion.p>
          {/* One next step: the solid pill. Pricing is a quiet text link beside it, so the two never look equal. */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.7, ease: EASE_IOS }}
            className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-3"
          >
            <PillCTA href={isLoggedIn ? "/dashboard" : "/register"}>{isLoggedIn ? "Go to dashboard" : "Get started"}</PillCTA>
            <Link
              href="/pricing"
              className="tap group inline-flex items-center gap-1 rounded-full px-3 py-2.5 text-body font-medium text-cream/80 transition-colors hover:text-cream"
            >
              See pricing
              <ChevronRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
