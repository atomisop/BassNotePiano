"use client";

import { useEffect, useId, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { applySolidSurfaces, readSolidSurfaces } from "@/lib/solidSurfaces";

/** Settings > Appearance: turns every glass surface into a plain opaque one (stored on this device). */
export function SolidSurfacesSwitch() {
  const id = useId();
  const [on, setOn] = useState(false);
  useEffect(() => setOn(readSolidSurfaces()), []);
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-50/12 p-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-body font-medium text-slate-50">Solid surfaces</label>
        <p className="mt-1 text-small text-slate-400">Plain, opaque panels and menus instead of see-through glass. Easier to read for some people and lighter on older phones.</p>
      </div>
      <Switch
        id={id}
        checked={on}
        onCheckedChange={(next) => {
          setOn(next);
          applySolidSurfaces(next);
        }}
      />
    </div>
  );
}
