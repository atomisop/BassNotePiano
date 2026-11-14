"use client";

import { useEffect, useState, type RefObject } from "react";

export type PillRect = { top: number; left: number; width: number; height: number };

/**
 * Where the current item of a menu is, measured against the menu itself, so one pill can glide to it. Re-measures when the menu or an
 * item changes size, and for half a second after a change (a sidebar opening or closing changes widths over a few hundred ms).
 * The current item is whichever element matches `selector` (by default the one marked `aria-current`).
 */
export function useActiveRect(navRef: RefObject<HTMLElement | null>, deps: ReadonlyArray<unknown>, selector = '[aria-current="page"]'): PillRect | null {
  const [rect, setRect] = useState<PillRect | null>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = nav.querySelector<HTMLElement>(selector);
      if (!el) return setRect(null);
      const n = nav.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const next = { top: r.top - n.top + nav.scrollTop, left: r.left - n.left + nav.scrollLeft, width: el.offsetWidth, height: el.offsetHeight };
      setRect((old) => (old && old.top === next.top && old.left === next.left && old.width === next.width && old.height === next.height ? old : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const ro = new ResizeObserver(schedule);
    ro.observe(nav);
    nav.querySelectorAll("a, button").forEach((a) => ro.observe(a));
    const timer = window.setInterval(schedule, 40);
    const stop = window.setTimeout(() => window.clearInterval(timer), 500);
    return () => {
      ro.disconnect();
      window.clearInterval(timer);
      window.clearTimeout(stop);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return rect;
}

/**
 * The solid orange pill behind the current menu item. It slides to the new item (a little springy vertically, like a thumb sliding along
 * a rail) and follows the item as its menu opens, closes or scrolls. The menu must be `position: relative` and its items `relative z-10`.
 */
export function SlidingPill({ rect, radius = 12 }: { rect: PillRect | null; radius?: number }) {
  if (!rect) return null;
  return (
    <span
      aria-hidden
      className="sliding-pill pointer-events-none absolute z-0 bg-signal"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        borderRadius: radius,
        boxShadow: "0 6px 18px -8px rgb(var(--signal) / 0.6)",
      }}
    />
  );
}
