"use client";

import { Children, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const SWIPE_PX = 60;

/**
 * A stack of cards the person flips through instead of scrolling past.
 *
 * Every card sits in the same grid cell, so the deck is as tall as its tallest
 * card and flipping never moves the content below it. The front card is in
 * full view; the next two peek out behind it (depth styling lives in
 * globals.css under `.deck-item`, so the first paint is already correct and
 * there is no hydration flash). Swipe the front card, tap a dot, or use the
 * arrow keys to change cards.
 *
 * Cards behind the front one are `aria-hidden` and their content is
 * `visibility: hidden`, so nothing in them can be focused or read out of
 * order. Intended for phones: the page shows it below `lg` and renders the
 * normal layout above.
 */
export function CardDeck({
  labels,
  label,
  className,
  children,
}: {
  /** One name per card, in order. Used for the dots and screen readers. */
  labels: string[];
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const items = Children.toArray(children);
  const count = items.length;
  const [active, setActive] = useState(0);
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const dragged = useRef(false);

  const go = (i: number) => setActive(((i % count) + count) % count);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragged.current = false;
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s) return;
    const moveX = e.clientX - s.x;
    const moveY = e.clientY - s.y;
    // Only a clearly horizontal gesture counts, so vertical scrolling past the
    // deck still works.
    if (!dragged.current && Math.abs(moveX) > 8 && Math.abs(moveX) > Math.abs(moveY)) {
      dragged.current = true;
      e.currentTarget.setPointerCapture?.(s.id);
    }
    if (dragged.current) setDx(moveX);
  }

  function finish() {
    if (dragged.current && Math.abs(dx) > SWIPE_PX) go(active + (dx < 0 ? 1 : -1));
    start.current = null;
    setDx(0);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") go(active + 1);
    else if (e.key === "ArrowLeft") go(active - 1);
    else return;
    e.preventDefault();
  }

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn("rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <div className="deck">
        {items.map((node, i) => {
          const depth = (i - active + count) % count;
          const front = depth === 0;
          return (
            <div
              key={i}
              className="deck-item"
              data-depth={Math.min(depth, 3)}
              aria-hidden={!front}
              aria-roledescription="slide"
              aria-label={`${labels[i]}, ${i + 1} of ${count}`}
              style={
                front
                  ? {
                      transform: `translateX(${dx}px) rotate(${dx / 40}deg)`,
                      transition: dx !== 0 ? "none" : undefined,
                      touchAction: "pan-y",
                    }
                  : undefined
              }
              onPointerDown={front ? onPointerDown : undefined}
              onPointerMove={front ? onPointerMove : undefined}
              onPointerUp={front ? finish : undefined}
              onPointerCancel={front ? finish : undefined}
              onClickCapture={
                front
                  ? (e) => {
                      // A swipe that ends on a link must not also follow it.
                      if (dragged.current) {
                        e.preventDefault();
                        e.stopPropagation();
                        dragged.current = false;
                      }
                    }
                  : undefined
              }
            >
              {node}
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex items-center justify-center gap-0.5" role="tablist" aria-label={`${label} pages`}>
        {labels.map((name, i) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={name}
            onClick={() => go(i)}
            className="tap flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
          >
            <span
              className={cn(
                "block h-2 rounded-full transition-all duration-(--dur-base) ease-(--ease-ios) motion-reduce:transition-none",
                i === active ? "w-5 bg-signal" : "w-2 bg-slate-600",
              )}
            />
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {labels[active]}, card {active + 1} of {count}
      </p>
    </div>
  );
}
