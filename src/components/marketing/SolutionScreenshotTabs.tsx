"use client";

import { useState } from "react";
import Image from "next/image";

export interface SolutionScreen {
  key: string;
  label: string;
  src: string;
  alt: string;
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
 */
export function SolutionScreenshotTabs({ screens, defaultKey }: { screens: SolutionScreen[]; defaultKey: string }) {
  const [active, setActive] = useState(defaultKey);
  const activeScreen = screens.find((s) => s.key === active) ?? screens[0];

  return (
    <div>
      <div className="relative aspect-[9/16] w-full max-w-sm overflow-hidden rounded-2xl border border-ink/10 sm:mx-auto lg:mx-0 lg:max-w-none">
        {screens.map((screen) => (
          <Image
            key={screen.key}
            src={screen.src}
            alt={screen.alt}
            fill
            sizes="(min-width: 1024px) 40vw, 90vw"
            className={`object-cover object-top transition-opacity duration-300 ${screen.key === active ? "opacity-100" : "opacity-0"}`}
            priority={screen.key === defaultKey}
          />
        ))}

        {/* Floating pill switcher, borrowed from the 21st.dev source's
            bottom-anchored tab bar, restyled in this app's own
            glass-surface-elevated material instead of a generic
            backdrop-blur pill. */}
        <div className="absolute inset-x-0 bottom-4 flex justify-center">
          <div className="glass-surface-elevated flex gap-1 rounded-full p-1">
            {screens.map((screen) => (
              <button
                key={screen.key}
                type="button"
                onClick={() => setActive(screen.key)}
                aria-pressed={screen.key === active}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                  screen.key === active ? "bg-[rgb(var(--c-a-500))] text-white" : "text-slate-300 hover:text-slate-50"
                }`}
              >
                {screen.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-sm text-slate-500 lg:text-left">
        Real screens from inside Bass Note Piano, {activeScreen.label.toLowerCase()} shown.
      </p>
    </div>
  );
}
