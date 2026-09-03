"use client";

import * as React from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

interface ScrollFrameSequenceProps {
  /** Files at `${basePath}/frame-001.webp` .. `${basePath}/frame-${frameCount}.webp`. */
  basePath: string;
  frameCount: number;
  /** Overlaid on top of the canvas, centered; visible at the very top of the
      scroll and fades out by TEXT_FADE_END. */
  children?: React.ReactNode;
  /** A second overlay in the same spot, fading in right as `children` finishes
      fading out, holding, then fading out again before the sequence settles
      (see TEXT2_* constants below), a second beat, not a second hero. */
  secondChildren?: React.ReactNode;
  /** A decorative layer rendered above the canvas but below the text beats
      (bottom-anchored, full-width), e.g. a foreground silhouette the
      hero content peeks over. Static content, rendered once; pair with
      `onProgress` to animate it yourself via a ref, the same direct-style-
      mutation approach this component already uses for its own text beats,
      rather than re-rendering it on every scroll tick. */
  foreground?: React.ReactNode;
  /** Called on every scroll update with the current 0-1 progress through the
      sequence: the same value driving the frame index and text fades.
      Optional; only needed if a caller wants to drive its own `foreground`
      animation off this component's own progress calculation, rather than
      duplicating the driver/scroll math independently. */
  onProgress?: (progress: number) => void;
  className?: string;
}

function frameSrc(basePath: string, index: number) {
  return `${basePath}/frame-${String(index + 1).padStart(3, "0")}.webp`;
}

/** SSR-safe: starts false (matches the server), corrected right after mount. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    queueMicrotask(() => setReduced(mq.matches));
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new window.Image();
  img.src = src;
  if (img.decode) {
    try {
      await img.decode();
      return img;
    } catch {
      // Fall through to the load/error event pair below (Safari can reject
      // decode() on images that still load fine).
    }
  }
  if (img.complete && img.naturalWidth > 0) return img;
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
  });
}

/** Draws `img` into the canvas box like CSS `object-fit: cover` would. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cw: number, ch: number) {
  const imgRatio = img.width / img.height;
  const boxRatio = cw / ch;
  let sx: number, sy: number, sw: number, sh: number;
  if (imgRatio > boxRatio) {
    sh = img.height;
    sw = sh * boxRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / boxRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
}

const PRELOAD_CONCURRENCY = 8;
/** How much scroll distance drives the full sequence, in viewport heights. */
const DRIVER_HEIGHT_VH = 300;
/** The first overlaid text/CTA is fully gone by this fraction of scroll
 * progress. The second beat (if any) starts fading in from exactly here,
 * so it picks up the instant the first one is out of the way. */
const TEXT_FADE_END = 0.35;
/** Second beat's own fade-in window ends here (fully visible from this point
 * on), then it holds until TEXT2_FADE_OUT_START, then fades out by
 * TEXT2_FADE_OUT_END, leaving the tail of the scroll as "settled" piano
 * with no text competing, same reasoning as the first beat's own fade-out. */
const TEXT2_FADE_IN_END = 0.5;
const TEXT2_FADE_OUT_START = 0.65;
const TEXT2_FADE_OUT_END = 0.8;

/**
 * A tall, sticky-pinned canvas that scrubs through a still-frame sequence as
 * the page scrolls, like Apple's product pages. Frame 1 renders immediately
 * as a real <Image> (fast LCP, works with JS disabled); the full sequence
 * loads in the background and canvas takes over once the first frame decodes.
 * Falls back to a plain static hero (frame 1, normal height, no scroll-jack)
 * under prefers-reduced-motion.
 *
 * Ported from the same component already proven in the Lulit app
 * (src/components/landing/scroll-frame-sequence.tsx there); the frame-
 * loading/canvas/scroll mechanics are unchanged. `secondChildren` and its
 * fade choreography, and `foreground`/`onProgress`, are new here, added
 * because this app's own hero needed a second beat and a foreground
 * reveal layer the original single-`children` version didn't support.
 */
export function ScrollFrameSequence({
  basePath,
  frameCount,
  children,
  secondChildren,
  foreground,
  onProgress,
  className,
}: ScrollFrameSequenceProps) {
  const reducedMotion = usePrefersReducedMotion();
  const driverRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const textRef = React.useRef<HTMLDivElement>(null);
  const text2Ref = React.useRef<HTMLDivElement>(null);
  const imagesRef = React.useRef<(HTMLImageElement | undefined)[]>([]);
  const lastDrawnRef = React.useRef<number>(-1);
  const [canvasReady, setCanvasReady] = React.useState(false);

  // Latest callback in a ref, read inside the scroll effect instead of
  // closed over directly: a caller almost certainly passes this inline
  // (a fresh function every render), and putting it in that effect's own
  // dependency array would tear down and rebuild the whole thing, frame
  // preloading included, on every one of the parent's re-renders.
  const onProgressRef = React.useRef(onProgress);
  React.useEffect(() => {
    onProgressRef.current = onProgress;
  });

  const posterSrc = frameSrc(basePath, 0);

  // Preload the sequence and keep redrawing the canvas as scroll moves,
  // skipped entirely under reduced motion (no point fetching every frame
  // nobody will scrub through).
  React.useEffect(() => {
    if (reducedMotion) return;

    let cancelled = false;
    imagesRef.current = new Array(frameCount);

    function drawIndex(index: number) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      // Nearest already-loaded frame at or before the target, so a slow
      // network never shows a blank canvas, only a slightly stale one.
      let i = index;
      while (i >= 0 && !imagesRef.current[i]) i--;
      if (i < 0) return;
      if (i === lastDrawnRef.current) return;
      lastDrawnRef.current = i;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawCover(ctx, imagesRef.current[i]!, cw, ch);
    }

    function updateFromScroll() {
      const driver = driverRef.current;
      if (!driver) return;
      const rect = driver.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, -rect.top / scrollable)) : 0;

      if (textRef.current) {
        const textProgress = Math.min(1, progress / TEXT_FADE_END);
        textRef.current.style.opacity = String(1 - textProgress);
        textRef.current.style.transform = `translateY(${textProgress * -24}px)`;
        textRef.current.style.pointerEvents = textProgress >= 1 ? "none" : "auto";
      }

      if (text2Ref.current) {
        let opacity2: number;
        if (progress <= TEXT_FADE_END) {
          opacity2 = 0;
        } else if (progress < TEXT2_FADE_IN_END) {
          opacity2 = (progress - TEXT_FADE_END) / (TEXT2_FADE_IN_END - TEXT_FADE_END);
        } else if (progress < TEXT2_FADE_OUT_START) {
          opacity2 = 1;
        } else if (progress < TEXT2_FADE_OUT_END) {
          opacity2 = 1 - (progress - TEXT2_FADE_OUT_START) / (TEXT2_FADE_OUT_END - TEXT2_FADE_OUT_START);
        } else {
          opacity2 = 0;
        }
        text2Ref.current.style.opacity = String(opacity2);
        // Slides up into place on the way in (mirrors the first beat's own
        // upward exit), no corresponding slide on the way out: a fade alone
        // reads cleaner for "stepping back to let the piano settle" than a
        // second translateY would.
        text2Ref.current.style.transform = `translateY(${(1 - opacity2) * 16}px)`;
        text2Ref.current.style.pointerEvents = opacity2 > 0.5 ? "auto" : "none";
      }

      onProgressRef.current?.(progress);

      drawIndex(Math.round(progress * (frameCount - 1)));
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateFromScroll();
        ticking = false;
      });
    }

    (async () => {
      // Frame 1 first and awaited alone, so the canvas can take over from
      // the poster <Image> the instant it's ready, then the rest load in a
      // capped-concurrency batch behind it.
      try {
        imagesRef.current[0] = await loadImage(frameSrc(basePath, 0));
      } catch {
        return;
      }
      if (cancelled) return;
      setCanvasReady(true);
      updateFromScroll();

      let next = 1;
      async function worker() {
        while (next < frameCount) {
          const i = next++;
          try {
            const img = await loadImage(frameSrc(basePath, i));
            if (cancelled) return;
            imagesRef.current[i] = img;
          } catch {
            // Leave this frame unset; drawIndex falls back to the nearest
            // earlier loaded frame.
          }
        }
      }
      await Promise.all(Array.from({ length: PRELOAD_CONCURRENCY }, worker));
    })();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelled = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [basePath, frameCount, reducedMotion]);

  if (reducedMotion) {
    // Both beats shown at once, stacked, fully visible, no fade: reduced
    // motion means no scroll-driven choreography, not less content. A
    // screen-reader or motion-sensitive visitor still gets everything both
    // beats say, just as one static screen instead of a staged reveal.
    return (
      <section className={cn("relative flex min-h-dvh w-full items-center justify-center overflow-hidden py-16", className)}>
        <Image src={posterSrc} alt="" fill priority sizes="100vw" className="object-cover" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/5 to-black/35" aria-hidden />
        <div className="relative z-10 flex flex-col items-center gap-10 px-4 text-center">
          <div className="flex flex-col items-center">{children}</div>
          {secondChildren && <div className="flex flex-col items-center">{secondChildren}</div>}
        </div>
      </section>
    );
  }

  return (
    <div ref={driverRef} className={cn("relative w-full", className)} style={{ height: `${DRIVER_HEIGHT_VH}dvh` }}>
      <section className="sticky top-0 flex h-dvh w-full items-center justify-center overflow-hidden">
        <Image
          src={posterSrc}
          alt=""
          fill
          priority
          sizes="100vw"
          className={cn("object-cover transition-opacity duration-300", canvasReady && "opacity-0")}
          aria-hidden
        />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/5 to-black/35" aria-hidden />
        {/* Between the scrim and the text on purpose: sits in front of the
            piano image, behind whichever text beat is currently showing, so
            a foreground silhouette can visually sit "under" the headline
            the same way it would if it were a real object in the scene. */}
        {foreground}
        {/* Both beats stacked in the exact same spot (absolute, not flex
            siblings) so the crossfade reads as one beat replacing the other
            in place, not two blocks side by side or one pushing the other
            down. Each owns its own ref/opacity; only one is ever above ~0.5
            opacity at a time (see the fade windows above), so overlapping
            hit-areas while both are mid-fade never actually causes a
            misclick: pointerEvents on each is already gated the same way. */}
        <div className="relative z-10 flex h-full w-full items-center justify-center px-4 text-center">
          <div ref={textRef} className="absolute flex flex-col items-center">
            {children}
          </div>
          {secondChildren && (
            <div ref={text2Ref} className="absolute flex flex-col items-center" style={{ opacity: 0 }}>
              {secondChildren}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
