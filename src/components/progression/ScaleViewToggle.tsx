"use client";

import { LayoutGrid, List } from "lucide-react";

export type ScaleView = "grid" | "list";

export const SCALE_VIEW_STORAGE_KEY = "bnp:scales-view";

// Adapted from 21st.dev's "View Mode Toggle Group" pattern (icon-only
// segmented toggle for switching layouts), restyled onto this app's own
// pill-toggle tokens — the same border-ink/10 + bg-amber-400 "pressed" look
// already used for ScaleExplorer's variant switcher and the admin lessons
// scale tabs — rather than pulling in its shadcn/base-ui dependency chain
// for a two-button control.
export function ScaleViewToggle({ value, onChange }: { value: ScaleView; onChange: (view: ScaleView) => void }) {
  const options: { value: ScaleView; label: string; Icon: typeof LayoutGrid }[] = [
    { value: "grid", label: "Grid view", Icon: LayoutGrid },
    { value: "list", label: "List view", Icon: List },
  ];

  return (
    <div role="group" aria-label="Scale list layout" className="flex gap-1 rounded-full border border-ink/10 p-1">
      {options.map(({ value: optionValue, label, Icon }) => (
        <button
          key={optionValue}
          type="button"
          onClick={() => onChange(optionValue)}
          aria-pressed={value === optionValue}
          title={label}
          className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition ${
            value === optionValue ? "bg-amber-400 text-slate-950" : "text-slate-400 hover:text-slate-100"
          }`}
        >
          <Icon size={16} aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
