"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "@/components/ui/appIcons";
import { cn } from "@/lib/utils";

/**
 * A row of cards you swipe sideways, the way Spotify and Duolingo show them (2026-10-30). The row runs to the screen's edges on a
 * phone but its first card starts in line with the page, and the swipe stays inside the row (`overscroll-behavior-x: contain`), so
 * reaching the end of a row never turns into the browser's back or forward gesture. Cards snap into place. With a mouse, arrows
 * next to the title step through it. Keep shelves to a few places on a page; never a whole page that pages sideways.
 */
export function Shelf({ title, aside, children, className, label }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string; label?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Start where you are (Duolingo opens the path on your lesson): the card marked aria-current, with the one before it still showing.
    const here = el.querySelector<HTMLElement>("[aria-current]");
    if (here) el.scrollLeft = Math.max(0, el.scrollLeft + here.getBoundingClientRect().left - el.getBoundingClientRect().left - here.offsetWidth - 28);
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      sizes.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const step = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  const arrow = "lgx-btn hidden h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:text-slate-50 disabled:opacity-30 [@media(hover:hover)]:inline-flex";

  return (
    <section aria-label={label ?? title} className={cn("min-w-0", className)}>
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3 px-1">
          {title && <h2 className="text-title font-semibold text-slate-50">{title}</h2>}
          <div className="flex items-center gap-2">
            {aside && <span className="text-small text-slate-400">{aside}</span>}
            {!(edges.start && edges.end) && (
              <>
                <button type="button" aria-label="Back" className={arrow} disabled={edges.start} onClick={() => step(-1)}>
                  <ChevronLeft aria-hidden className="h-4 w-4" />
                </button>
                <button type="button" aria-label="More" className={arrow} disabled={edges.end} onClick={() => step(1)}>
                  <ChevronRight aria-hidden className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <ul ref={ref} className="shelf -mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 md:mx-0 md:scroll-px-0 md:px-0">
        {children}
      </ul>
    </section>
  );
}

/** One card in a shelf: a fixed width so the next card peeks in, telling you the row scrolls. */
export function ShelfItem({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cn("w-40 shrink-0 snap-start sm:w-44", className)}>{children}</li>;
}
