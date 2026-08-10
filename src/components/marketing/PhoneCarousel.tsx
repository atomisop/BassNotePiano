"use client";

// A 3D coverflow of phone-framed screenshots, built as a direct-manipulation
// surface rather than a swipe detector.
//
// The distinction matters. The previous version listened for pointerdown /
// pointerup and, if the pointer had moved more than 40px, changed the index —
// a "final state" recogniser. Nothing moved while the finger did, so there was
// no continuous feedback, no velocity to inherit, and no way to grab the
// carousel mid-flight. Everything below exists to fix that:
//
//   • position is a continuous MotionValue in slide units, tracked 1:1 with
//     the pointer (direct manipulation)
//   • the animation can be grabbed and redirected at any moment, because a
//     drag re-takes the same value mid-spring (interruptibility)
//   • release hands the pointer's velocity to the spring, so there's no seam
//     between dragging and animating (velocity handoff)
//   • the landing slide is chosen from the *projected* resting point, so a
//     flick throws the carousel instead of nudging it one slot (momentum)
//   • past the first/last slide the surface keeps moving but gives less and
//     less, rather than hitting a wall (rubber-banding)

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { project, rubberband, velocityFrom, type PointerSample } from "@/lib/motion";

export interface PhoneScreenshot {
  src: string;
  alt: string;
}

// Perspective lives on the stage so all three phones share one vanishing
// point — set per-item instead and each converges on its own centre, which
// reads as a bug rather than a scene.
const PERSPECTIVE = 1400;
const ROTATION = 34; // deg of Y-rotation per slide away from centre
const DEPTH = -230; // px pushed back in Z per slide away
const SPREAD = 0.74; // horizontal offset per slide, as a fraction of phone width
const DRAG_THRESHOLD = 10; // px of movement before a press becomes a drag

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
          draggable={false}
          className="object-cover object-top"
        />
      </div>
    </div>
  );
}

/**
 * One phone, deriving its entire transform from the shared continuous
 * position. Kept as its own component so the useTransform hooks aren't called
 * inside a loop.
 */
function Phone({
  image,
  index,
  position,
  phoneWidth,
  count,
  flat,
  onSelect,
  isActive,
  priority,
}: {
  image: PhoneScreenshot;
  index: number;
  position: MotionValue<number>;
  phoneWidth: number;
  count: number;
  flat: boolean;
  onSelect: () => void;
  isActive: boolean;
  priority: boolean;
}) {
  const offset = useTransform(position, (p) => index - p);

  const x = useTransform(offset, (o) => o * phoneWidth * (flat ? 1.05 : SPREAD));
  const rotateY = useTransform(offset, (o) => (flat ? 0 : o * -ROTATION));
  const z = useTransform(offset, (o) => (flat ? 0 : Math.abs(o) * DEPTH));
  const scale = useTransform(offset, (o) => 1 - Math.min(Math.abs(o), 1) * 0.06);
  const opacity = useTransform(offset, (o) => (Math.abs(o) > 1.6 ? 0 : 1));
  // Darkens the phones turning away so depth reads even where the rotation
  // alone is subtle. Continuous, so it tracks the drag instead of snapping.
  const shade = useTransform(offset, (o) => Math.min(Math.abs(o), 1) * 0.28);
  const zIndex = useTransform(offset, (o) => count - Math.round(Math.abs(o)));

  return (
    <motion.button
      type="button"
      aria-label={isActive ? undefined : `Show ${image.alt}`}
      aria-current={isActive}
      tabIndex={isActive ? -1 : 0}
      onClick={onSelect}
      className="absolute rounded-[2.5rem]"
      style={{ x, z, rotateY, scale, opacity, zIndex, transformStyle: "preserve-3d", willChange: "transform" }}
    >
      <PhoneFrame src={image.src} alt={image.alt} width={phoneWidth} priority={priority} />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[2.5rem] bg-scrim"
        style={{ opacity: shade }}
      />
    </motion.button>
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
  const count = images.length;
  const maxIndex = Math.max(0, count - 1);
  const startIndex = count > 1 ? 1 : 0;

  const position = useMotionValue(startIndex);
  const [active, setActive] = useState(startIndex);
  const [narrow, setNarrow] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const phoneWidth = narrow ? 178 : 250;
  const stageHeight = Math.round((phoneWidth * 19.5) / 9) + 28;

  // Keeps the dots and arrows in sync with wherever the continuous value is,
  // including mid-drag — the phones themselves never re-render for this.
  useMotionValueEvent(position, "change", (p) => {
    const rounded = Math.round(p);
    if (rounded !== active && rounded >= 0 && rounded <= maxIndex) setActive(rounded);
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const settleTo = useCallback(
    (target: number, velocitySlidesPerSec = 0) => {
      const clamped = Math.max(0, Math.min(maxIndex, target));
      animate(position, clamped, {
        type: "spring",
        // Bounce is earned here: the user threw it. Tapping a dot lands
        // critically damped instead, since no momentum preceded it.
        bounce: velocitySlidesPerSec !== 0 ? 0.18 : 0,
        duration: 0.42,
        velocity: velocitySlidesPerSec,
      });
    },
    [maxIndex, position],
  );

  const goTo = useCallback((i: number) => settleTo(i, 0), [settleTo]);

  // ---- Direct manipulation ------------------------------------------------
  const drag = useRef<{
    id: number;
    startX: number;
    startPos: number;
    samples: PointerSample[];
    moved: boolean;
  } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Grabbing mid-flight has to take over the *current* on-screen value, not
    // the one the spring was heading for, or the carousel jumps on contact.
    position.stop();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      startX: e.clientX,
      startPos: position.get(),
      samples: [{ value: e.clientX, time: performance.now() }],
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;

    const dx = e.clientX - d.startX;
    d.samples.push({ value: e.clientX, time: performance.now() });
    if (d.samples.length > 12) d.samples.shift();

    // Hysteresis: a press only becomes a drag once it has clearly moved, so
    // taps on a side phone still select it.
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    d.moved = true;

    const slideWidth = phoneWidth * SPREAD;
    let next = d.startPos - dx / slideWidth;

    // Past either end, keep following the finger but give progressively less.
    if (next < 0) next = -rubberband(-next, count);
    else if (next > maxIndex) next = maxIndex + rubberband(next - maxIndex, count);

    position.set(next);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return; // never became a drag — let the click through

    const slideWidth = phoneWidth * SPREAD;
    // Pointer px/s → carousel slides/s. Inverted: dragging left advances.
    const velocity = -velocityFrom(d.samples) / slideWidth;
    // Land where the flick is *going*, not where the finger happened to stop.
    const projected = position.get() + project(velocity);
    settleTo(Math.round(projected), velocity);
  }

  const flat = Boolean(prefersReducedMotion);

  if (count === 0) return null;

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
            goTo(Math.min(maxIndex, active + 1));
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            goTo(Math.max(0, active - 1));
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative mx-auto flex cursor-grab touch-pan-y items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 active:cursor-grabbing"
        style={{ height: stageHeight, perspective: PERSPECTIVE, transformStyle: "preserve-3d" }}
      >
        {images.map((img, i) => (
          <Phone
            key={img.src}
            image={img}
            index={i}
            position={position}
            phoneWidth={phoneWidth}
            count={count}
            flat={flat}
            isActive={i === active}
            priority={i <= 1}
            onSelect={() => goTo(i)}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => goTo(Math.max(0, active - 1))}
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
              onClick={() => goTo(i)}
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
          onClick={() => goTo(Math.min(maxIndex, active + 1))}
          disabled={active === maxIndex}
          aria-label="Next screen"
          className="glass-pill flex h-9 w-9 items-center justify-center text-slate-500 transition hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ArrowIcon dir={1} />
        </button>
      </div>
    </div>
  );
}
