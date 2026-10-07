"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { WordsPullUp } from "@/components/ui/words-pull-up";
import { PillCTA } from "@/components/ui/pill-cta";
import { BACKDROPS } from "@/lib/backdrops";
import { heroVideoAllowed } from "@/lib/heroVideo";

// Served from R2 (the same object storage the app already uses for lesson
// videos and avatars, see lib/storage.ts), not the Next.js public folder: 17MB
// is a lot of repo weight for one background loop, and R2 has no egress fees.
const HERO_VIDEO_URL = "https://pub-0fe2f6dde02a45099c1719d7c4e554b5.r2.dev/marketing/1788454184967-hero-piano.mp4";

/**
 * Keeps the background loop playing. autoPlay alone leaves it stopped on phones
 * in a few ordinary cases: iOS Low Power Mode and data-saver modes refuse to
 * autoplay until the person touches the page, and Safari pauses it when you
 * switch apps or tabs and does not always resume it. This asks it to play again
 * on load, when the tab becomes visible, and on the first touch, click, key
 * press or scroll, and quietly gives up if the browser still says no.
 */
function useKeepPlaying(ref: React.RefObject<HTMLVideoElement>) {
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
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
  }, [ref]);
}

type NetworkInfo = { saveData?: boolean; effectiveType?: string };

export function Hero() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const videoRef = useRef<HTMLVideoElement>(null);
  // The still photo paints first. The 17MB video only starts downloading after the page has
  // finished loading, and only for people whose connection and settings suit it.
  const [loadVideo, setLoadVideo] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInfo }).connection;
    const allowed = heroVideoAllowed({
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      saveData: Boolean(connection?.saveData),
      effectiveType: connection?.effectiveType ?? null,
    });
    if (!allowed) return;
    const start = () => setLoadVideo(true);
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, []);
  useKeepPlaying(videoRef);

  return (
    <section className="h-[100svh] w-full p-2 sm:p-3">
      <div className="relative h-full w-full overflow-hidden rounded-2xl bg-black md:rounded-[2rem]">
        {/* pointer-events-none: pure background, so a phone never offers its own tap-to-play glyph over the copy. */}
        <Image src={BACKDROPS.marketingHero} alt="" aria-hidden fill priority sizes="100vw" className="pointer-events-none object-cover" />
        <video
          ref={videoRef}
          aria-hidden
          autoPlay
          loop
          muted
          playsInline
          preload="none"
          src={loadVideo ? HERO_VIDEO_URL : undefined}
          onPlaying={() => setVideoPlaying(true)}
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${videoPlaying ? "opacity-100" : "opacity-0"}`}
        />

        <div aria-hidden className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.7] mix-blend-overlay" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />

        <div className="absolute bottom-0 left-0 right-0 px-4 pb-2 sm:px-6 md:px-10">
          <div className="grid grid-cols-12 items-end gap-4">
            <div className="col-span-12 lg:col-span-8">
              <h1 className="text-[22vw] font-medium leading-[0.85] tracking-[-0.07em] text-[#E1E0CC] sm:text-[19vw] md:text-[16vw] lg:text-[13vw] xl:text-[12.5vw]">
                <WordsPullUp text="Bass Note Piano" />
              </h1>
            </div>

            <div className="col-span-12 flex flex-col gap-5 pb-6 lg:col-span-4 lg:pb-10">
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="text-sm leading-[1.2] text-[#E1E0CC]/70 md:text-base"
              >
                Ethiopian music, taught live. Piano, guitar and bass lessons with a real teacher, and a curriculum that opens one scale at a time.
              </motion.p>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
              >
                <PillCTA href={isLoggedIn ? "/dashboard" : "/register"}>{isLoggedIn ? "Go to dashboard" : "Get started"}</PillCTA>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
