"use client";

import { LayoutGrid, List } from "lucide-react";

export type ScaleView = "grid" | "list";

export const SCALE_VIEW_STORAGE_KEY = "bnp:scales-view";

// Adapted from 21st.dev's "View Mode Toggle Group" pattern (icon-only
// segmented toggle for switching layouts), restyled onto this app's own
// pill-toggle tokens (the pressed option uses the signal tint, matching
// the shared Tabs control) rather than pulling in its shadcn/base-ui dependency chain
// for a two-button control.
export function ScaleViewToggle({ value, onChange }: { value: ScaleView; onChange: (view: ScaleView) => void }) {
  const options: { value: ScaleView; label: string; Icon: typeof LayoutGrid }[] = [
    { value: "grid", label: "Grid view", Icon: LayoutGrid },
    { value: "list", label: "List view", Icon: List },
  ];

  return (
    <div role="group" aria-label="Scale list layout" className="flex gap-1 rounded-full border border-ink/[0.08] bg-[rgb(var(--c-s-50)/0.04)] p-1">
      {options.map(({ value: optionValue, label, Icon }) => (
        <button
          key={optionValue}
          type="button"
          onClick={() => onChange(optionValue)}
          aria-pressed={value === optionValue}
          title={label}
          className={`tap flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            value === optionValue ? "bg-[rgb(var(--signal)/0.14)] text-signal" : "text-slate-400 hover:text-slate-100"
          }`}
        >
          <Icon size={16} aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
