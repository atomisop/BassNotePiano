"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { GlassLens } from "@/components/ui/GlassLens";

/**
 * The dark / light switch, as a pane of Liquid Glass: a recessed track with the current mode written on it and a glass lens that slides
 * over it (it is taller than the track, so it overhangs like the real thing) with a faint rainbow rim. It springs into place.
 */
export function LiquidThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "ink";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Dark mode. Switch to light." : "Light mode. Switch to dark."}
      onClick={() => setTheme(dark ? "paper" : "ink")}
      className={`tap relative inline-block h-14 w-40 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      <span className="absolute inset-x-0 top-2.5 bottom-2.5 rounded-full bg-neu-base shadow-pressed-mid" aria-hidden />
      <span
        aria-hidden
        className={`absolute top-1/2 -translate-y-1/2 text-body font-medium text-slate-300 transition-[left,right,opacity] duration-300 ${dark ? "left-5" : "right-5"}`}
      >
        {dark ? "Dark" : "Light"}
      </span>
      <span
        aria-hidden
        className="absolute left-0 top-0 flex h-14 w-[4.25rem] items-center justify-center rounded-full transition-transform duration-500 [transition-timing-function:cubic-bezier(0.2,1.15,0.3,1)]"
        style={{ transform: dark ? "translateX(5.75rem)" : "translateX(0)" }}
      >
        <GlassLens radius="full" bezel={20} strength={22} blur={1} />
        <span className="relative z-10 flex">
        {dark ? <Moon className="h-6 w-6 text-white drop-shadow-[0_0_8px_rgb(255_255_255/0.8)]" fill="currentColor" /> : <Sun className="h-6 w-6 text-slate-50 drop-shadow-[0_0_8px_rgb(255_255_255/0.8)]" />}
        </span>
      </span>
    </button>
  );
}
