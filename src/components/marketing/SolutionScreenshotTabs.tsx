"use client";

import { BlurhashImage } from "@/components/ui/BlurhashImage";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useInView, useReducedMotion } from "framer-motion";
import { PhoneFrame } from "@/components/ui/phone-frame";

export interface SolutionScreen {
  key: string;
  label: string;
  src: string;
  alt: string;
  title: string;
  caption: string;
}

const SCREEN_MS = 3400;

/**
 * The app on a phone, played like a screen recording: it steps through the
 * screens on its own while it is on screen, and tapping a label jumps to that
 * screen and restarts the clock. Reduced motion shows one screen and waits for a tap.
 */
export function SolutionScreenshotTabs({ screens, defaultKey }: { screens: SolutionScreen[]; defaultKey: string }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(() => Math.max(0, screens.findIndex((s) => s.key === defaultKey)));
  const [prev, setPrev] = useState(-1);
  const [started, setStarted] = useState(false);
  function goTo(next: number) {
    if (next === active) return;
    setPrev(active);
    setStarted(true);
    setActive(next);
  }
  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const inView = useInView(wrapRef, { amount: 0.4 });
  const screen = screens[active];

  useEffect(() => {
    if (reduced || !inView) return;
    const id = setTimeout(() => goTo((active + 1) % screens.length), SCREEN_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, inView, reduced, screens.length]);

  useEffect(() => {
    const row = rowRef.current;
    const el = row?.querySelector<HTMLElement>(`[data-screen="${screen.key}"]`);
    if (!row || !el) return;
    row.scrollTo({ left: el.offsetLeft - (row.clientWidth - el.clientWidth) / 2, behavior: "smooth" });
  }, [screen.key]);

  return (
    <div ref={wrapRef}>
      <PhoneFrame>
        {/* Every screen is stacked and already loaded. The new one fades in on top while the
            previous one stays fully visible underneath, so the phone is never empty or dark. */}
        {screens.map((s, i) => {
          const isActive = i === active;
          const isPrev = i === prev;
          return (
            <div
              key={s.key}
              className="absolute inset-0"
              style={{
                zIndex: isActive ? 2 : isPrev ? 1 : 0,
                opacity: isActive || isPrev ? 1 : 0,
                animation: isActive && !reduced && started ? "phone-screen-in 0.6s ease-out both" : undefined,
              }}
            >
              <BlurhashImage src={s.src} alt={isActive ? s.alt : ""} aria-hidden={!isActive} sizes="(min-width: 1024px) 300px, 80vw" loading={i === 0 ? "eager" : "lazy"} className="object-cover object-top" />
            </div>
          );
        })}
      </PhoneFrame>

      <p className="mt-6 text-center text-small text-[#E1E0CC]/60" aria-live="off">
        {screen.caption}
      </p>

      <div
        ref={rowRef}
        role="tablist"
        aria-label="App screens"
        className="relative mx-auto mt-4 flex max-w-full snap-x gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {screens.map((s, i) => {
          const selected = i === active;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              data-screen={s.key}
              aria-selected={selected}
              onClick={() => goTo(i)}
              className={`tap shrink-0 snap-center rounded-full px-4 py-1.5 text-small font-medium transition ${
                selected ? "bg-[rgb(var(--c-a-400))] text-black shadow-pressed-low" : "neu-btn !text-[#E1E0CC]/70 hover:!text-[#E1E0CC]"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
