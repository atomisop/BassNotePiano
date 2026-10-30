"use client";

import { THEMES, type ThemeChoice } from "@/lib/themes";
import { useTheme } from "./ThemeProvider";
import { LiquidThemeToggle } from "./LiquidThemeToggle";

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
      <path d="M5 12l5 5L19 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A tiny live preview of the theme: ground, a card on it, and a line of text. */
function ThemeSwatch({ swatch }: { swatch: [string, string, string] }) {
  const [ground, surface, text] = swatch;
  return (
    <div
      className="flex h-12 w-full items-center gap-1.5 rounded-md px-2 bg-neu-base shadow-raised-low"
      style={{ background: ground }}
      aria-hidden
    >
      <div className="h-7 flex-1 rounded" style={{ background: surface }} />
      <div className="flex flex-1 flex-col gap-1">
        <div className="h-1.5 w-full rounded-full" style={{ background: text, opacity: 0.85 }} />
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: text, opacity: 0.45 }} />
      </div>
    </div>
  );
}

const CURATED_THEMES = THEMES.filter((t) => t.source === "curated");

/**
 * `compact` is for the marketing popover, where vertical space is tight and
 * the descriptions would crowd it out. Settings gets the full version.
 *
 * There used to be a second fieldset here for accent color (rust, rose,
 * gold, sage, indigo, signal). Removed along with the rest of that system
 * (see themes.ts's own comment), so this is just the one light/dark/system
 * choice now, nothing left to pick a color for.
 */
export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  const options: { id: ThemeChoice; label: string }[] = [
    ...CURATED_THEMES.map((t) => ({ id: t.id as ThemeChoice, label: t.label })),
    { id: "system", label: "Match system" },
  ];

  if (!compact) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <LiquidThemeToggle />
        <button
          type="button"
          onClick={() => setTheme("system")}
          aria-pressed={theme === "system"}
          className={`tap rounded-full px-3.5 py-2 text-small font-medium shadow-raised-low ${theme === "system" ? "bg-signal text-slate-950" : "bg-neu-base text-slate-200"}`}
        >
          Match my device
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 p-3">
      <fieldset>
        <legend className={compact ? "sr-only" : "eyebrow mb-3"}>Theme</legend>
        <div className={compact ? "space-y-1.5" : "grid gap-3 sm:grid-cols-3"}>
          {options.map((opt) => {
            const meta = CURATED_THEMES.find((t) => t.id === opt.id);
            const selected = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                aria-pressed={selected}
                className={`w-full rounded-lg border p-2.5 text-left transition ${
                  selected
                    ? "border-amber-400/70 bg-neu-base shadow-pressed-low"
                    : "border-transparent hover:border-slate-50/40 bg-neu-base shadow-raised-low"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-small font-medium text-slate-100">{opt.label}</span>
                  {selected && (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400 text-slate-950">
                      <CheckIcon />
                    </span>
                  )}
                </span>
                {meta && !compact && (
                  <>
                    <span className="mt-2 block">
                      <ThemeSwatch swatch={meta.swatch} />
                    </span>
                    <span className="mt-2 block text-small text-slate-500">{meta.description}</span>
                  </>
                )}
                {!meta && !compact && (
                  <span className="mt-2 block text-small text-slate-500">
                    Follows your device&apos;s light or dark setting, and switches with it.
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </fieldset>

    </div>
  );
}
