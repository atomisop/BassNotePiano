"use client";

import { ROOT_KEYS, type RootKey } from "@/lib/music-theory";

export interface KeySelectorProps {
  value: RootKey;
  onChange: (key: RootKey) => void;
}

/** The shared 12-key root picker driving both the Transposition Dashboard and the Chords panel. */
export function KeySelector({ value, onChange }: KeySelectorProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ROOT_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={key === value}
          className={`h-9 min-w-[2.5rem] rounded-lg border px-2 text-sm font-medium transition ${
            key === value
              ? "border-[rgb(var(--c-a-400))] bg-[rgb(var(--c-a-400)/0.1)] text-[rgb(var(--c-a-300))]"
              : "border-ink/10 text-slate-400 hover:border-ink/15 hover:text-slate-100"
          }`}
        >
          {key}
        </button>
      ))}
    </div>
  );
}
