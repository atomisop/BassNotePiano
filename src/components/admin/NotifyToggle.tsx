"use client";

import { useEffect, useId, useState } from "react";
import { Switch } from "@/components/ui/switch";

const key = (place: string) => `bnp-notify-student:${place}`;
const EVENT = "bnp-notify-student";

/**
 * The "Notify student" choice for one place where the studio changes something (credits, a class, a plan, a payment...). Off by default:
 * a change is not announced only because it was made. Each place remembers its last choice on this device. The value goes to the action,
 * which runs quietly when it is false (src/lib/notifyScope.ts).
 */
export function useNotifyStudent(place: string, defaultOn = false): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(defaultOn);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key(place));
      if (saved !== null) setOn(saved === "1");
    } catch {}
    // Every switch and button for the same place stays in step (one switch at the top of a list drives each row's buttons).
    const follow = (e: Event) => {
      const d = (e as CustomEvent<{ place: string; on: boolean }>).detail;
      if (d?.place === place) setOn(d.on);
    };
    window.addEventListener(EVENT, follow);
    return () => window.removeEventListener(EVENT, follow);
  }, [place]);
  const set = (next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(key(place), next ? "1" : "0");
    } catch {}
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { place, on: next } }));
  };
  return [on, set];
}

/** A switch for a place whose buttons are drawn elsewhere (a server page's rows): it shares their choice through `useNotifyStudent(place)`. */
export function NotifyPlaceToggle({ place, label, className, defaultOn = false }: { place: string; label?: string; className?: string; defaultOn?: boolean }) {
  const [on, setOn] = useNotifyStudent(place, defaultOn);
  return <NotifyToggle on={on} onChange={setOn} label={label} className={className} />;
}

/** The switch itself. `label` names who is told ("Notify student", "Notify Alex"). */
export function NotifyToggle({ on, onChange, label = "Notify student", className = "" }: { on: boolean; onChange: (on: boolean) => void; label?: string; className?: string }) {
  const id = useId();
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Switch id={id} checked={on} onCheckedChange={onChange} />
      <label htmlFor={id} className="cursor-pointer text-small text-slate-300">
        {label}
      </label>
    </div>
  );
}
