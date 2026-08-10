"use client";

import { ACCENTS, DAISY_THEME_IDS, THEMES, isDaisyTheme, type ThemeChoice, type ThemeId } from "@/lib/themes";
import { useTheme } from "./ThemeProvider";

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
      className="flex h-12 w-full items-center gap-1.5 rounded-md border border-ink/10 px-2"
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
const DAISY_THEMES = THEMES.filter((t) => t.source === "daisyui");

/**
 * `compact` is for the marketing popover, where vertical space is tight and
 * the descriptions would crowd it out. Settings gets the full version.
 */
export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { theme, resolvedTheme, accent, setTheme, setAccent } = useTheme();

  const options: { id: ThemeChoice; label: string }[] = [
    ...CURATED_THEMES.map((t) => ({ id: t.id as ThemeChoice, label: t.label })),
    { id: "system", label: "Match system" },
  ];

  // Once a daisyUI theme is picked, `theme` is a DaisyThemeId, not "system"
  // or one of the three curated ids — so none of the curated cards or the
  // "Match system" card should read as selected, and the accent axis (which
  // that theme doesn't participate in) should say so rather than silently
  // doing nothing.
  const daisyActive = typeof theme === "string" && isDaisyTheme(theme as ThemeId);

  return (
    <div className={compact ? "w-64 p-3" : ""}>
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
                    ? "border-amber-400 bg-amber-400/10"
                    : "border-ink/10 hover:border-amber-400/40 hover:bg-ink/5"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-100">{opt.label}</span>
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
                    <span className="mt-2 block text-xs leading-relaxed text-slate-500">{meta.description}</span>
                  </>
                )}
                {!meta && !compact && (
                  <span className="mt-2 block text-xs leading-relaxed text-slate-500">
                    Follows your device&apos;s light or dark setting, and switches with it.
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* The daisyUI batch: 32 complete looks, each with colour baked in, so
          a compact swatch grid rather than 32 repeats of the description
          card above — that would make this panel unusable. */}
      <fieldset className={compact ? "mt-3 border-t border-ink/10 pt-3" : "mt-8"}>
        <legend className={compact ? "sr-only" : "eyebrow mb-3"}>More themes</legend>
        {!compact && (
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            32 complete looks — each one is its own thing, colour and accent together, not mixed with the accents
            below.
          </p>
        )}
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
          {DAISY_THEMES.map((t) => {
            const selected = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                aria-pressed={selected}
                title={t.label}
                className={`group flex flex-col items-center gap-1 rounded-lg border p-1.5 transition ${
                  selected ? "border-amber-400" : "border-ink/10 hover:border-amber-400/40"
                }`}
              >
                <span
                  className="relative flex h-8 w-full items-center justify-center overflow-hidden rounded"
                  style={{ background: t.swatch[0] }}
                  aria-hidden
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: t.swatch[2] }} />
                  {selected && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
                      <CheckIcon />
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-[10px] font-medium text-slate-400 group-hover:text-slate-200">
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={compact ? "mt-3 border-t border-ink/10 pt-3" : "mt-8"}>
        <legend className={compact ? "sr-only" : "eyebrow mb-3"}>Accent</legend>
        {daisyActive ? (
          <p className="text-xs leading-relaxed text-slate-500">
            {DAISY_THEMES.find((t) => t.id === theme)?.label} brings its own accent — switch to Editorial Paper, Ink,
            or Midnight Glass to pick one of these instead.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => {
              const selected = accent === a.id;
              const dot = resolvedTheme === "paper" ? a.light : a.dark;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccent(a.id)}
                  aria-pressed={selected}
                  title={a.label}
                  className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-xs font-medium transition ${
                    selected
                      ? "border-amber-400 text-slate-100"
                      : "border-ink/10 text-slate-500 hover:border-amber-400/40 hover:text-slate-200"
                  }`}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    style={{ background: dot, color: resolvedTheme === "paper" ? "#fff" : "#14110E" }}
                  >
                    {selected && <CheckIcon />}
                  </span>
                  {a.label}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      {!compact && (
        <p className="mt-6 text-xs leading-relaxed text-slate-600">
          Saved in this browser, so it applies straight away and follows you around the site — but it won&apos;t carry
          over to a different device or browser.
        </p>
      )}
    </div>
  );
}
