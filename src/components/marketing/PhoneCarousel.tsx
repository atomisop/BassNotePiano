"use client";

// A 3D coverflow carousel of phone-framed screenshots. The active phone
// faces the viewer; the ones either side are pushed back in Z and rotated
// away on their Y axis, so the row reads as three objects standing in space
// rather than three pictures lying flat on the page.
//
// Built from scratch (this project has no shadcn/radix, and the original
// reference's carousel internals were never included in the snippet), so the
// geometry is explicit below rather than inherited from a library.

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

export interface PhoneScreenshot {
  src: string;
  alt: string;
}

// Perspective lives on the stage so all three phones share one vanishing
// point — set per-item instead and each converges on its own centre, which
// reads as a bug rather than a scene.
const PERSPECTIVE = 1400;
const ROTATION = 34; // deg of Y-rotation per step away from centre
const DEPTH = -230; // px pushed back in Z per step away
const SPREAD = 0.74; // horizontal offset per step, as a fraction of phone width

function PhoneFrame({ src, alt, width, priority }: PhoneScreenshot & { width: number; priority: boolean }) {
  return (
    /* The bezel is hardcoded dark rather than tokenised: a phone's chassis is
       a real object, not a themed surface, so it must not invert with the
       rest of the palette. */
    <div
      className="relative rounded-[2.5rem] border-[6px] border-[#2A2521] bg-[#2A2521] shadow-[0_30px_60px_-24px_rgba(26,21,15,0.45)]"
      style={{ width }}
    >
      <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-[#2A2521]" />
      <div className="absolute -right-[7px] top-24 h-12 w-[3px] rounded-full bg-[#4A423C]" />
      <div className="relative aspect-[9/19.5] w-full overflow-hidden rounded-[2rem] bg-surface">
        <Image
          src={src}
          alt={alt}
          fill
          sizes={`${Math.round(width)}px`}
          priority={priority}
          className="object-cover object-top"
        />
      </div>
    </div>
  );
}

function ArrowIcon({ dir }: { dir: 1 | -1 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path
        d={dir === -1 ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PhoneCarousel({ images }: { images: PhoneScreenshot[] }) {
  const [active, setActive] = useState(images.length > 1 ? 1 : 0);
  const [narrow, setNarrow] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const dragStartX = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const phoneWidth = narrow ? 178 : 250;
  // The stage must reserve the phone's full height itself: every phone is
  // absolutely positioned, so none of them contribute to layout height.
  const stageHeight = Math.round((phoneWidth * 19.5) / 9) + 28;

  const go = useCallback(
    (dir: 1 | -1) => setActive((i) => Math.min(images.length - 1, Math.max(0, i + dir))),
    [images.length],
  );

  function onPointerDown(e: React.PointerEvent) {
    dragStartX.current = e.clientX;
  }
  function onPointerUp(e: React.PointerEvent) {
    if (dragStartX.current === null) return;
    const dx = e.clientX - dragStartX.current;
    dragStartX.current = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  }

  if (images.length === 0) return null;

  return (
    <div className="relative select-none">
      <div
        role="group"
        aria-roledescription="carousel"
        aria-label="Screens from inside the app"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            go(1);
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            go(-1);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (dragStartX.current = null)}
        className="relative mx-auto flex touch-pan-y items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
        style={{ height: stageHeight, perspective: PERSPECTIVE, transformStyle: "preserve-3d" }}
      >
        {images.map((img, i) => {
          const offset = i - active;
          const distance = Math.abs(offset);
          const isActive = offset === 0;
          return (
            <motion.button
              key={img.src}
              type="button"
              aria-label={isActive ? undefined : `Show ${img.alt}`}
              aria-current={isActive}
              tabIndex={isActive ? -1 : 0}
              onClick={() => !isActive && setActive(i)}
              className={`absolute rounded-[2.5rem] ${isActive ? "cursor-default" : "cursor-pointer"}`}
              initial={false}
              animate={
                prefersReducedMotion
                  ? // No 3D under reduced motion: lay the row out flat and let
                    // the off-centre phones just sit smaller and dimmer.
                    {
                      x: offset * phoneWidth * 1.05,
                      z: 0,
                      rotateY: 0,
                      scale: isActive ? 1 : 0.9,
                      opacity: distance > 1 ? 0 : 1,
                    }
                  : {
                      x: offset * phoneWidth * SPREAD,
                      z: distance * DEPTH,
                      rotateY: offset * -ROTATION,
                      scale: isActive ? 1 : 0.94,
                      opacity: distance > 1 ? 0 : 1,
                    }
              }
              transition={{ type: "spring", stiffness: 210, damping: 26, mass: 0.9 }}
              style={{
                zIndex: images.length - distance,
                transformStyle: "preserve-3d",
                pointerEvents: distance > 1 ? "none" : "auto",
              }}
            >
              <PhoneFrame src={img.src} alt={img.alt} width={phoneWidth} priority={i <= 1} />
              {/* Darkens the phones turning away, so the depth reads even
                  where the rotation alone is subtle. Clears as one comes
                  forward. */}
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[2.5rem] bg-scrim"
                initial={false}
                animate={{ opacity: isActive ? 0 : 0.28 }}
                transition={{ duration: 0.35 }}
              />
            </motion.button>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={active === 0}
          aria-label="Previous screen"
          className="glass-pill flex h-9 w-9 items-center justify-center text-slate-500 transition hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ArrowIcon dir={-1} />
        </button>

        <div className="flex items-center gap-2">
          {images.map((img, i) => (
            <button
              key={img.src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show ${img.alt}`}
              aria-current={i === active}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-6 bg-amber-400" : "w-1.5 bg-ink/20 hover:bg-ink/40"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => go(1)}
          disabled={active === images.length - 1}
          aria-label="Next screen"
          className="glass-pill flex h-9 w-9 items-center justify-center text-slate-500 transition hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ArrowIcon dir={1} />
        </button>
      </div>
    </div>
  );
}
