"use client";

import { ROOT_KEYS, type RootKey } from "@/lib/music-theory";

export interface KeySelectorProps {
  value: RootKey;
  onChange: (key: RootKey) => void;
}

/**
 * The shared 12-key root picker driving both the Transposition Dashboard and
 * the Chords panel. 21st.dev's segmented-control/toggle-group components are
 * built for a handful of options (2-5) with no wrap behavior, none fit a
 * 12-item single-select that needs to wrap onto a second row at narrow
 * widths, so this keeps its own markup, restyled with the same
 * role="group" + aria-pressed pattern those components use for accessible
 * single-select button groups.
 */
export function KeySelector({ value, onChange }: KeySelectorProps) {
  return (
    <div role="group" aria-label="Root key" className="flex flex-wrap gap-1.5">
      {ROOT_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={key === value}
          className={`h-11 min-w-[2.75rem] cursor-pointer rounded-control border px-2 text-small font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            key === value
              ? "border-signal bg-[rgb(var(--signal)/0.14)] text-signal-fg"
              : "border-transparent text-slate-300 hover:text-slate-50 bg-neu-base shadow-raised-low"
          }`}
        >
          {key}
        </button>
      ))}
    </div>
  );
}
