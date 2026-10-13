"use client";

import { LayoutGrid, List } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";

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
    <Tabs
      label="Scale list layout"
      items={options.map(({ value: optionValue, label, Icon }) => ({
        id: optionValue,
        label: (
          <>
            <Icon size={16} aria-hidden />
            <span className="sr-only">{label}</span>
          </>
        ),
      }))}
      value={value}
      onChange={onChange}
    />
  );
}
