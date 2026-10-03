"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export interface SolutionScreen {
  key: string;
  label: string;
  src: string;
  alt: string;
  title: string;
  caption: string;
}

/**
 * The one genuinely interactive piece of Solution.tsx, split into its own
 * client component so Solution itself can stay a server component. Solution
 * needs SOLO_MAX_CREDITS from `@/lib/classSchedule` for real copy, and that
 * module's chain (notifications -> email -> resend) is server-only,
 * Prisma-touching code; a "use client" Solution would have shipped all of
 * it into the browser bundle. This component takes SCREENS as a prop
 * instead of importing anything server-side itself, so it stays safely
 * client-only.
 *
 * Twelve screens now, so the switcher is a horizontally scrolling row of
 * pills under the phone (not an overlay on the picture), and only the
 * selected screenshot is mounted: the others load when you pick them.
 */
export function SolutionScreenshotTabs({ screens, defaultKey }: { screens: SolutionScreen[]; defaultKey: string }) {
  const [active, setActive] = useState(defaultKey);
  const [loaded, setLoaded] = useState(false);
  const activeScreen = screens.find((s) => s.key === active) ?? screens[0];
  const activeIndex = screens.findIndex((s) => s.key === activeScreen.key);
  const rowRef = useRef<HTMLDivElement>(null);

  // Centre the chosen pill by scrolling the pill row itself. Not
  // scrollIntoView: that also scrolls the whole page to reach the row, which
  // would jump the page on load and on every tap. Skipped on first render.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const row = rowRef.current;
    const el = row?.querySelector<HTMLElement>(`[data-screen="${activeScreen.key}"]`);
    if (!row || !el) return;
    row.scrollTo({ left: el.offsetLeft - (row.clientWidth - el.clientWidth) / 2, behavior: "smooth" });
  }, [activeScreen.key]);

  function select(key: string) {
    if (key === active) return;
    setLoaded(false);
    setActive(key);
  }

  return (
    <div>
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-3xl bg-neu-base shadow-raised-mid">
        <Image
          key={activeScreen.key}
          src={activeScreen.src}
          alt={activeScreen.alt}
          fill
          sizes="(min-width: 1024px) 340px, 90vw"
          onLoad={() => setLoaded(true)}
          className={`object-cover object-top transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          priority={activeScreen.key === defaultKey}
        />
      </div>

      <div
        ref={rowRef}
        role="tablist"
        aria-label="App screens"
        className="relative mx-auto mt-5 flex max-w-full snap-x gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {screens.map((screen) => {
          const selected = screen.key === activeScreen.key;
          return (
            <button
              key={screen.key}
              type="button"
              role="tab"
              data-screen={screen.key}
              aria-selected={selected}
              onClick={() => select(screen.key)}
              className={`tap shrink-0 snap-center rounded-full px-4 py-1.5 text-small font-medium transition ${
                selected
                  ? "bg-neu-base text-amber-400 shadow-pressed-low"
                  : "bg-neu-base text-slate-300 shadow-raised-low hover:text-slate-50 hover:shadow-raised-mid"
              }`}
            >
              {screen.label}
            </button>
          );
        })}
      </div>

      <div className="mx-auto mt-3 max-w-[340px] text-center" aria-live="polite">
        <p className="font-serif text-body font-bold text-slate-50">{activeScreen.title}</p>
        <p className="mt-1 text-small text-slate-400">{activeScreen.caption}</p>
        <p className="mt-2 text-small text-slate-600">
          {activeIndex + 1} of {screens.length}
        </p>
      </div>
    </div>
  );
}
