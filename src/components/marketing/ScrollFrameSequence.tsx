"use client";

import * as React from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

interface ScrollFrameSequenceProps {
  /** Files at `${basePath}/frame-001.webp` .. `${basePath}/frame-${frameCount}.webp`. */
  basePath: string;
  frameCount: number;
  /** Overlaid on top of the canvas, centered; fades out as the sequence plays. */
  children?: React.ReactNode;
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
/** The overlaid text/CTA is fully gone by this fraction of scroll progress,
 * so the room reads as "settled" for the back half of the scrub. */
const TEXT_FADE_END = 0.35;

/**
 * A tall, sticky-pinned canvas that scrubs through a still-frame sequence as
 * the page scrolls, like Apple's product pages. Frame 1 renders immediately
 * as a real <Image> (fast LCP, works with JS disabled); the full sequence
 * loads in the background and canvas takes over once the first frame decodes.
 * Falls back to a plain static hero (frame 1, normal height, no scroll-jack)
 * under prefers-reduced-motion.
 *
 * Ported verbatim from the same component already proven in the Lulit app
 * (src/components/landing/scroll-frame-sequence.tsx there), no logic
 * changes, since it was already solving exactly this problem well. Only
 * the file naming convention changed (PascalCase, matching this project's
 * own marketing component files).
 */
export function ScrollFrameSequence({ basePath, frameCount, children, className }: ScrollFrameSequenceProps) {
  const reducedMotion = usePrefersReducedMotion();
  const driverRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const textRef = React.useRef<HTMLDivElement>(null);
  const imagesRef = React.useRef<(HTMLImageElement | undefined)[]>([]);
  const lastDrawnRef = React.useRef<number>(-1);
  const [canvasReady, setCanvasReady] = React.useState(false);

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
    return (
      <section className={cn("relative flex h-dvh w-full items-center justify-center overflow-hidden", className)}>
        <Image src={posterSrc} alt="" fill priority sizes="100vw" className="object-cover" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/5 to-black/35" aria-hidden />
        <div className="relative z-10 flex flex-col items-center px-4 text-center">{children}</div>
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
        <div ref={textRef} className="relative z-10 flex flex-col items-center px-4 text-center">
          {children}
        </div>
      </section>
    </div>
  );
}
