"use client";

import { Children, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Adapted from the "Snap Carousel" on 21st.dev by ddoemonn (the drag-and-snap hook and the spring settings). Changed for this
// app: framer-motion instead of motion/react, this app's surface and signal colors and icons, `inert` set the way CardDeck does
// it (React 18 has no `inert` prop), a tap on a peeking neighbour brings it forward, and a swipe that ends on a link or button
// no longer also taps it.

const CROSSFADE = { type: "spring", stiffness: 260, damping: 34, mass: 0.8 } as const;
const WALL = { type: "spring", stiffness: 700, damping: 30, mass: 0.5 } as const;
const WALL_IMPULSE = 900;
/** A finger that wanders less than this while pressing is a tap, not a swipe. */
const TAP_SLOP_PX = 8;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// useLayoutEffect warns during server rendering; measuring only matters in the browser.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type DragInfo = { offset: { x: number; y: number }; velocity: { x: number; y: number } };

function useSnapCarousel({ count, defaultIndex = 0, gap = 12, momentum = 0.14, maxFlick = 1 }: { count: number; defaultIndex?: number; gap?: number; momentum?: number; maxFlick?: number }) {
  const total = Math.max(1, Math.floor(count));
  const [index, setIndex] = useState(() => clamp(defaultIndex, 0, total - 1));
  const [slideWidth, setSlideWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [target, setTarget] = useState(index);
  const step = slideWidth + gap;

  const viewportRef = useRef<HTMLDivElement>(null);
  const anim = useRef<{ stop: () => void } | null>(null);
  const desired = useRef<number | null>(null);
  const lastStep = useRef(0);
  const live = useRef(index);
  live.current = index;
  const metrics = useRef({ step, total, momentum, maxFlick });
  metrics.current = { step, total, momentum, maxFlick };

  const x = useMotionValue(0);
  const reduced = useReducedMotion();

  const glide = useCallback(
    (to: number, velocity = 0) => {
      desired.current = to;
      anim.current?.stop();
      anim.current = animate(x, to, reduced ? { duration: 0 } : { ...CROSSFADE, velocity });
    },
    [x, reduced],
  );

  const goTo = useCallback(
    (next: number, velocity = 0) => {
      const shelf = metrics.current;
      const to = clamp(Math.round(next), 0, shelf.total - 1);
      setTarget(to);
      if (to !== live.current) {
        live.current = to;
        setIndex(to);
      }
      glide(-to * shelf.step, velocity);
    },
    [glide],
  );

  const bounce = useCallback(
    (dir: 1 | -1) => {
      const to = -live.current * metrics.current.step;
      desired.current = to;
      anim.current?.stop();
      anim.current = animate(x, to, reduced ? { duration: 0 } : { ...WALL, velocity: -dir * WALL_IMPULSE });
    },
    [x, reduced],
  );

  const move = useCallback(
    (dir: 1 | -1) => {
      const to = live.current + dir;
      if (to < 0 || to > metrics.current.total - 1) bounce(dir);
      else goTo(to);
    },
    [bounce, goTo],
  );

  const pick = useCallback(
    (velocity: number) => {
      const shelf = metrics.current;
      if (shelf.step === 0) return live.current;
      const at = -x.get() / shelf.step;
      const anchor = clamp(Math.round(at), 0, shelf.total - 1);
      const projected = at - (velocity * shelf.momentum) / shelf.step;
      return clamp(clamp(Math.round(projected), anchor - shelf.maxFlick, anchor + shelf.maxFlick), 0, shelf.total - 1);
    },
    [x],
  );

  // The slide is as wide as the viewport's inner box (the peek is padding), so it follows the screen as it is resized.
  useIsoLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setSlideWidth((current) => (Math.abs(current - width) < 0.5 ? current : width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useIsoLayoutEffect(() => {
    if (step === 0) return;
    const to = -index * step;
    if (lastStep.current !== step) {
      lastStep.current = step;
      desired.current = to;
      anim.current?.stop();
      x.set(to);
      return;
    }
    if (dragging || desired.current === to) return;
    glide(to);
  }, [index, step, dragging, glide, x]);

  useEffect(() => () => anim.current?.stop(), []);

  const swiped = useRef(false);
  const onDragStart = useCallback(() => {
    anim.current?.stop();
    swiped.current = false;
    setDragging(true);
    setTarget(live.current);
  }, []);
  const onDrag = useCallback(
    (_e: unknown, info: DragInfo) => {
      if (Math.abs(info.offset.x) > TAP_SLOP_PX) swiped.current = true;
      const to = pick(info.velocity.x);
      setTarget((current) => (current === to ? current : to));
    },
    [pick],
  );
  const onDragEnd = useCallback(
    (_e: unknown, info: DragInfo) => {
      setDragging(false);
      goTo(pick(info.velocity.x), info.velocity.x);
      // The click that follows the lift is still to come; clear the flag once it has passed.
      window.setTimeout(() => {
        swiped.current = false;
      }, 80);
    },
    [goTo, pick],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") move(1);
      else if (event.key === "ArrowLeft") move(-1);
      else if (event.key === "Home") goTo(0);
      else if (event.key === "End") goTo(metrics.current.total - 1);
      else return;
      event.preventDefault();
    },
    [goTo, move],
  );

  return { index, target, shown: dragging ? target : index, dragging, swiped, x, step, gap, total, ready: slideWidth > 0, goTo, move, viewportRef, onKeyDown, onDragStart, onDrag, onDragEnd };
}

/**
 * One card at a time with its neighbours peeking in at both edges: swipe, tap a dot, tap a neighbour, or use the arrows or
 * arrow keys. Meant for phones; the page shows the normal side-by-side layout from lg up.
 */
export function SnapCarousel({
  children,
  label,
  defaultIndex = 0,
  gap = 12,
  peek = 0,
  viewportClassName,
  className,
}: {
  children: ReactNode;
  /** Names the carousel for screen readers. */
  label: string;
  defaultIndex?: number;
  gap?: number;
  /** How much of each neighbour shows at the sides, in px. */
  peek?: number;
  /** Extra room above and below, for a glow or shadow that would otherwise be clipped. */
  viewportClassName?: string;
  className?: string;
}) {
  const slides = Children.toArray(children);
  const hintId = useId();
  const reduced = useReducedMotion();
  const car = useSnapCarousel({ count: slides.length, defaultIndex, gap });

  // The neighbours stay clearly visible at the edges (about half strength at the very edge, full by the card), so it is obvious there is more to swipe to.
  const fade = `linear-gradient(to right, rgba(0,0,0,0.5) 0, black ${peek}px, black calc(100% - ${peek}px), rgba(0,0,0,0.5) 100%)`;
  const control =
    "tap flex h-9 w-9 items-center justify-center rounded-full bg-neu-base text-slate-100 shadow-raised-low transition active:shadow-pressed-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={car.viewportRef}
        role="group"
        aria-roledescription="carousel"
        aria-label={label}
        aria-describedby={hintId}
        tabIndex={0}
        onKeyDown={car.onKeyDown}
        // The browser may scroll a focused slide into view inside the clipped box; the track is moved by us, not by scrolling.
        onScroll={(e) => {
          e.currentTarget.scrollLeft = 0;
        }}
        style={{ paddingLeft: peek, paddingRight: peek, ...(peek > 0 ? { WebkitMaskImage: fade, maskImage: fade } : {}) }}
        className={cn("relative overflow-hidden rounded-card py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring", viewportClassName)}
        // A swipe that ends on a link or button must not also press it.
        onClickCapture={(e) => {
          if (car.swiped.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <motion.div
          drag={slides.length < 2 ? false : "x"}
          dragDirectionLock
          dragMomentum={false}
          dragElastic={0.14}
          dragConstraints={{ left: -(slides.length - 1) * car.step, right: 0 }}
          onDragStart={car.onDragStart}
          onDrag={car.onDrag}
          onDragEnd={car.onDragEnd}
          // Hidden until the width is measured, so the track never visibly jumps from the first card to the opening one.
          style={{ x: car.x, gap: `${gap}px`, touchAction: "pan-y", opacity: car.ready ? 1 : 0 }}
          className={cn("flex items-stretch", car.dragging ? "cursor-grabbing" : "cursor-grab")}
        >
          {slides.map((slide, i) => {
            const front = i === car.index;
            return (
              <motion.div
                key={isValidElement(slide) && slide.key ? slide.key : i}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${slides.length}`}
                initial={false}
                animate={i === car.shown ? { scale: 1, opacity: 1 } : { scale: 0.96, opacity: 0.8 }}
                transition={reduced ? { duration: 0 } : CROSSFADE}
                // A neighbour is brought forward by a tap anywhere on it.
                onClick={front ? undefined : () => car.goTo(i)}
                className="w-full shrink-0 select-none"
              >
                <div
                  className="h-full"
                  ref={(el) => {
                    // Nothing inside a card that is not in front can be focused or pressed (it can only be brought forward).
                    el?.toggleAttribute("inert", !front);
                  }}
                >
                  {slide}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-0.5" role="group" aria-label={`${label} pages`}>
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => car.goTo(i)}
              aria-label={`Go to card ${i + 1}`}
              aria-current={i === car.index ? "true" : undefined}
              className="tap flex h-6 min-w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn("block h-2 rounded-full transition-all duration-(--dur-base) ease-(--ease-ios) motion-reduce:transition-none", i === car.shown ? "w-5 bg-signal" : "w-2 bg-slate-600")} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => car.move(-1)} aria-label="Previous card" className={control}>
            <ChevronLeft aria-hidden className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => car.move(1)} aria-label="Next card" className={control}>
            <ChevronRight aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </div>
      <span id={hintId} className="sr-only">
        Left and right arrow keys move between {slides.length} cards.
      </span>
      <span aria-live="polite" aria-atomic className="sr-only">
        Card {car.index + 1} of {slides.length}
      </span>
    </div>
  );
}
