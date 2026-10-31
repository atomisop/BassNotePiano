"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TAB_TRACK, tabItem } from "@/components/ui/tabStyles";

export type TabItem<T extends string> = { id: T; label: ReactNode; count?: number };

// useLayoutEffect warns during server rendering; the thumb only needs it in
// the browser.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * iOS-style segmented tabs with a sliding thumb.
 *
 * The sliding-thumb technique (measure the active segment, move one
 * absolutely positioned thumb under it) is adapted from Halaska UI's
 * SegmentedControl via 21st.dev, MIT License (c) Halaska,
 * https://ui.halaska.com. Restyled to this app's tokens: the thumb is the
 * selected state, which is tappable, so it carries the signal tint.
 *
 * Keyboard: arrow keys move between tabs, Home/End jump to the ends, the
 * way a native tab list behaves. Motion is skipped under reduced motion.
 */
export function Tabs<const T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  const baseId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const index = items.findIndex((item) => item.id === value);
    const btn = refs.current[index];
    if (!btn || !containerRef.current) return;
    setThumb({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [items, value]);

  useIsoLayoutEffect(() => {
    measure();
  }, [measure]);

  // On a narrow screen the row scrolls sideways; when the chosen tab changes (a tap, or a deep link), bring it into view.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const btn = refs.current[itemsRef.current.findIndex((item) => item.id === value)];
    const track = containerRef.current;
    // Only the row itself scrolls (scrollIntoView also moves every scrolling parent, which slid the whole page sideways).
    if (btn && track && track.scrollWidth > track.clientWidth) {
      track.scrollTo({ left: btn.offsetLeft - (track.clientWidth - btn.offsetWidth) / 2, behavior: "smooth" });
    }
  }, [value]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [measure]);

  function onKeyDown(e: KeyboardEvent, index: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % items.length;
    if (e.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={label}
      className={cn(
        "relative",
        TAB_TRACK,
        className,
      )}
    >
      {thumb && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 bottom-1 left-0 rounded-full bg-neu-base shadow-raised-low transition-[transform,width] duration-(--dur-base) ease-(--ease-ios) motion-reduce:transition-none"
          style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }}
        />
      )}
      {items.map((item, i) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            id={`${baseId}-tab-${item.id}`}
            aria-pressed={active}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={tabItem(active, { thumb: true })}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 && (
              <span className={cn("tabular-nums", active ? "text-signal-fg" : "text-slate-500")}>{item.count > 9 ? "9+" : item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
