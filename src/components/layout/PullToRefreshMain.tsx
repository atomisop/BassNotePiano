"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowDown } from "lucide-react";
import { MorphingSquare } from "@/components/ui/morphing-square";

// Pull distance (px, after resistance) that counts as "refresh", and the most
// the content is allowed to travel.
const THRESHOLD_PX = 64;
const MAX_PULL_PX = 96;

/**
 * The signed-in app's scroll area, with pull-to-refresh back.
 *
 * The shell is locked on purpose (fixed screen, `overscroll-behavior: none` on
 * the body, `overscroll-contain` here) so the top bar and dock can never be
 * dragged, and that also switches off the browser's own pull-to-refresh. This
 * gives it back inside the one scroll area: pull down while at the very top and
 * release past the threshold to reload the tab, the same as the browser's own
 * pull-to-refresh, without the shell ever moving.
 *
 * Skipped on /messages (its panes have their own scrolling lists, and a
 * pull there would fight them), when the touch began inside something that is
 * itself scrolled down, and for sideways drags.
 */
export function PullToRefreshMain({ className, children }: { className: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const pullRef = useRef(0);

  const enabled = !pathname.startsWith("/messages");

  function startedInsideScrolledArea(target: EventTarget | null): boolean {
    let el = target instanceof HTMLElement ? target : null;
    while (el && el !== mainRef.current) {
      if (el.scrollHeight > el.clientHeight && el.scrollTop > 0) return true;
      el = el.parentElement;
    }
    return false;
  }

  function onTouchStart(e: React.TouchEvent) {
    if (!enabled || refreshing) return;
    const main = mainRef.current;
    if (!main || main.scrollTop > 0 || startedInsideScrolledArea(e.target)) return;
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function onTouchMove(e: React.TouchEvent) {
    const start = startRef.current;
    if (!start) return;
    const dy = e.touches[0].clientY - start.y;
    const dx = e.touches[0].clientX - start.x;
    // Upward or mostly-sideways drag: this is a normal scroll or swipe, not a pull.
    if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
      if (pullRef.current !== 0) {
        pullRef.current = 0;
        setPull(0);
      }
      return;
    }
    // Resistance: the further you drag, the less the content follows.
    const next = Math.min(MAX_PULL_PX, dy * 0.5);
    pullRef.current = next;
    setPull(next);
  }

  function onTouchEnd() {
    if (!startRef.current) return;
    startRef.current = null;
    if (pullRef.current >= THRESHOLD_PX) {
      setRefreshing(true);
      setPull(THRESHOLD_PX);
      // A real reload, not router.refresh(): this stands in for the browser's own gesture.
      window.location.reload();
    } else {
      pullRef.current = 0;
      setPull(0);
    }
  }

  const armed = pull >= THRESHOLD_PX;
  const progress = Math.min(1, pull / THRESHOLD_PX);

  return (
    <main
      ref={mainRef}
      className={className}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {pull > 0 && (
        <div
          aria-hidden={!refreshing}
          role={refreshing ? "status" : undefined}
          className="pointer-events-none fixed left-1/2 top-[4.5rem] z-40 -translate-x-1/2"
          style={{ opacity: progress, transform: `translate(-50%, ${pull * 0.4}px)` }}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neu-base text-slate-300 shadow-raised-mid">
            {refreshing ? (
              <MorphingSquare size={16} />
            ) : (
              <ArrowDown
                size={18}
                strokeWidth={2}
                className="transition-transform duration-150"
                style={{ transform: `rotate(${armed ? 180 : 0}deg)` }}
              />
            )}
            <span className="sr-only">{refreshing ? "Refreshing" : armed ? "Release to refresh" : "Pull to refresh"}</span>
          </div>
        </div>
      )}
      <div
        style={{ transform: pull > 0 ? `translateY(${pull}px)` : undefined, transition: startRef.current ? "none" : "transform 200ms ease-out" }}
      >
        {children}
      </div>
    </main>
  );
}
