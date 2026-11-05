"use client";

import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemeChoice } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { LiquidGlassControl } from "@/components/theme/LiquidGlassControl";

const CHOICES: { id: ThemeChoice; label: string }[] = [
  { id: "paper", label: "Light" },
  { id: "ink", label: "Dark" },
  { id: "system", label: "System" },
];

/** A little picture of a screen in that look: a card with two lines of text and the orange dot. */
function Preview({ choice }: { choice: ThemeChoice }) {
  const light = (
    <span className="absolute inset-1.5 rounded-md border border-black/10 bg-white">
      <span className="absolute left-2 top-2 h-0.5 w-7 rounded-full bg-black/35" />
      <span className="absolute left-2 top-3.5 h-0.5 w-5 rounded-full bg-black/35" />
      <span className="absolute bottom-2 right-2 h-2.5 w-2.5 rounded-full bg-[#d65c2c]" />
    </span>
  );
  const dark = (
    <span className="absolute inset-1.5 rounded-md border border-white/10 bg-[#222]">
      <span className="absolute left-2 top-2 h-0.5 w-7 rounded-full bg-white/45" />
      <span className="absolute left-2 top-3.5 h-0.5 w-5 rounded-full bg-white/45" />
      <span className="absolute bottom-2 right-2 h-2.5 w-2.5 rounded-full bg-[#fb8a5c]" />
    </span>
  );
  if (choice === "paper") return <span className="absolute inset-0 bg-[#f4f4f6]">{light}</span>;
  if (choice === "ink") return <span className="absolute inset-0 bg-[#121212]">{dark}</span>;
  // System: light on the top left, dark on the bottom right, split on the diagonal.
  return (
    <>
      <span className="absolute inset-0 bg-[#f4f4f6]">{light}</span>
      <span className="absolute inset-0 bg-[#121212] [clip-path:polygon(100%_0,100%_100%,0_100%)]">{dark}</span>
    </>
  );
}

/**
 * Appearance, right in the Settings list (like the Claude app): three pictures, Light, Dark and System, and one tap switches. It replaces
 * the separate "Themes & Appearance" screen. `compact` fits the computer's side menu.
 */
export function AppearanceTiles({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  return (
    <>
    <div role="radiogroup" aria-label="Appearance" className={cn("grid grid-cols-3", compact ? "gap-2" : "gap-3")}>
      {CHOICES.map((c) => {
        const on = theme === c.id;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setTheme(c.id)}
            className="tap group flex flex-col items-center gap-1.5 focus-visible:outline-none"
          >
            <span
              className={cn(
                "relative block w-full overflow-hidden rounded-xl ring-2 transition group-focus-visible:ring-ring",
                compact ? "h-11" : "h-16 sm:h-20",
                on ? "ring-signal" : "ring-transparent hover:ring-slate-50/20",
              )}
            >
              <Preview choice={c.id} />
            </span>
            <span className={cn("text-small", on ? "font-semibold text-signal-fg" : "text-slate-300")}>{c.label}</span>
          </button>
        );
      })}
    </div>
    {!compact && <div className="mt-5"><LiquidGlassControl /></div>}
    </>
  );
}
