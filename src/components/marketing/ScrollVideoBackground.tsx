"use client";

import { useEffect, useRef, useState } from "react";
import { MEDIA } from "@/lib/media-manifest";

/**
 * A full-viewport video whose playhead is driven by page scroll.
 *
 * The video never plays on its own — scroll position *is* the transport. The
 * page's 0→1 scroll progress maps onto the clip's 0→duration, so scrolling
 * the homepage top to bottom plays the clip start to finish, and scrolling
 * back up runs it in reverse.
 *
 * Four things make this smooth rather than a slideshow:
 *
 *  1. **The encode.** Both sources are deliberately all-intra (every frame a
 *     keyframe). Seeking a normally-encoded file forces the decoder to walk
 *     forward from the nearest keyframe — measured at 538ms per seek on the
 *     original 4K HEVC master, against a 16.7ms budget for 60fps. All-intra
 *     brings that to ~5ms because any frame decodes on its own. No amount of
 *     client-side cleverness fixes a sparse GOP; it has to be solved in the
 *     encode.
 *
 *  2. **`fastSeek` where available.** It normally trades accuracy for speed by
 *     snapping to the nearest keyframe — but when every frame *is* a keyframe,
 *     there is no accuracy left to trade. So on WebKit this is strictly faster
 *     than assigning `currentTime`, for an identical result.
 *
 *  3. **Damping, not direct assignment.** Scroll position is written to a
 *     target and the playhead eases toward it in a rAF loop. Assigning the
 *     time straight from the scroll handler makes the video jitter, because
 *     trackpads and touch momentum emit many small deltas per frame.
 *
 *  4. **A seek threshold.** The write is skipped unless the playhead is off by
 *     at least half a frame, so we don't spend decode budget landing on the
 *     picture already on screen.
 */

/** Source clip length, in seconds. Used until real metadata lands. */
const FALLBACK_DURATION = 9.82;

/** Below this width the lighter encode is used — 1.9MB rather than 5.6MB. */
const MOBILE_MAX_WIDTH = 820;

/**
 * Remote first, local second.
 *
 * The assets total ~31MB, which is the wrong thing to keep in git — it would be
 * permanent history on every clone and every deploy. They live on R2 instead,
 * with the hashed URLs recorded in the generated media manifest.
 *
 * The local `/video/*` paths remain as a fallback so the page still works
 * before the first upload, in a fresh clone, or if the manifest is ever wiped.
 */
export function ScrollVideoBackground({
  src = MEDIA.video || "/video/studio.mp4",
  mobileSrc = MEDIA.videoMobile || "/video/studio-mobile.mp4",
  poster = MEDIA.poster || "/video/studio-poster.jpg",
}: {
  src?: string;
  mobileSrc?: string;
  poster?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // `null` until the client decides — avoids rendering a <video> during SSR
  // and then swapping its src on hydration, which restarts the download.
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  // Static mode renders the poster alone and does no video work whatsoever.
  const [staticMode, setStaticMode] = useState(false);

  useEffect(() => {
    // Reduced motion is the ONLY reason to fall back to a still now. An earlier
    // version also excluded every coarse-pointer device, which meant phones —
    // the majority of visitors — silently got a static image while the effect
    // was the whole point of the page. They get the lighter encode instead.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStaticMode(true);
      return;
    }
    setResolvedSrc(window.innerWidth <= MOBILE_MAX_WIDTH ? mobileSrc : src);
  }, [src, mobileSrc]);

  useEffect(() => {
    if (staticMode || !resolvedSrc) return;
    const video = videoRef.current;
    if (!video) return;

    let frame = 0;
    let current = 0;
    let target = 0;
    let ready = false;

    /**
     * iOS will not decode or paint a frame for a video that has never played,
     * so a purely seek-driven video stays frozen on its poster there — which
     * is exactly the "doesn't play on phone" symptom. Playing muted and
     * immediately pausing hands us a decoded pipeline without the clip ever
     * visibly running.
     *
     * Muted inline autoplay is permitted on iOS, but Low Power Mode still
     * refuses it, so a first-touch retry is registered as a fallback.
     */
    let primed = false;
    const prime = () => {
      // Guarded: prime() is wired to both `loadeddata` and a first-gesture
      // fallback. Without this, a successful autoplay-prime would be followed
      // by a second play/pause on the user's first touch — a visible hitch on
      // exactly the interaction that starts the scroll.
      if (primed) return;
      const attempt = video.play();
      if (attempt && typeof attempt.then === "function") {
        attempt
          .then(() => {
            primed = true;
            video.pause();
          })
          .catch(() => {
            /* Blocked (iOS Low Power Mode). The gesture listener retries. */
          });
      } else {
        primed = true;
        video.pause();
      }
    };

    const onFirstGesture = () => prime();
    window.addEventListener("touchstart", onFirstGesture, { passive: true, once: true });
    window.addEventListener("pointerdown", onFirstGesture, { passive: true, once: true });

    const onReady = () => {
      ready = true;
      prime();
    };
    video.addEventListener("loadeddata", onReady);
    if (video.readyState >= 2) onReady();

    const readTarget = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      const duration =
        Number.isFinite(video.duration) && video.duration > 0 ? video.duration : FALLBACK_DURATION;
      // Stop a hair short of the end: seeking exactly to `duration` fires
      // `ended` in some browsers and can blank the frame.
      target = progress * (duration - 0.05);
    };

    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!ready) return;

      // Exponential damping — distance sets the settle time, so a flick and a
      // nudge both feel proportionate. Matches the Lenis page physics.
      current += (target - current) * 0.12;

      // Half a frame. The source is now 60fps rather than 24, so the old 1/48
      // threshold was coarser than a whole frame — it would skip real frame
      // changes and reintroduce exactly the stepping the 60fps encode exists
      // to remove.
      if (Math.abs(video.currentTime - current) > 1 / 120) {
        if (typeof video.fastSeek === "function") {
          video.fastSeek(current);
        } else {
          video.currentTime = current;
        }
      }
    };

    readTarget();
    current = target;
    window.addEventListener("scroll", readTarget, { passive: true });
    window.addEventListener("resize", readTarget);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", readTarget);
      window.removeEventListener("resize", readTarget);
      window.removeEventListener("touchstart", onFirstGesture);
      window.removeEventListener("pointerdown", onFirstGesture);
      video.removeEventListener("loadeddata", onReady);
    };
  }, [staticMode, resolvedSrc]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* The poster sits underneath permanently, covering the gap before the
          first frame decodes so the page never flashes an empty box. */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${poster})` }}
      />

      {!staticMode && resolvedSrc && (
        <video
          ref={videoRef}
          src={resolvedSrc}
          poster={poster}
          muted
          playsInline
          // `disableRemotePlayback` keeps AirPlay from offering to fling a
          // decorative background to a TV.
          disableRemotePlayback
          preload="auto"
          tabIndex={-1}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* ---- Base tint ----
          0.60, down from the 0.84 flat wash this started as. That earlier
          number was derived correctly — it is genuinely what a *single* global
          layer needs to hold body copy at 4.5:1 against the clip's brightest
          pixel — but solving it globally was the wrong shape. It spent the
          contrast budget across the entire frame, including the large empty
          regions with no text in them, which veils the footage everywhere and
          is why a 4K source could still look soft.

          Protection is local now: see <TextShelf>, which puts a pool of shade
          under each block of type and falls off to nothing. This layer only has
          to keep the midtones in range; the shelves do the AA work. */}
      <div className="absolute inset-0 bg-slate-950/60" />
      <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-slate-950 via-slate-950/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent" />
      {/* Warm bloom tying the footage to the brand accent. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 70% at 50% 30%, rgb(217 154 42 / 0.07), transparent 70%)",
        }}
      />
    </div>
  );
}
