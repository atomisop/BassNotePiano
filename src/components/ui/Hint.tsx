"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A tiny "i" that opens a small popup with one short line, only when someone taps it. For the few things that really need a word of
 * explanation (a privacy warning, a one-time step), so the screen itself stays free of explainer text. Closes on a tap elsewhere or Escape.
 */
export function Hint({ children, label = "More info", className }: { children: React.ReactNode; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={cn("relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        className="tap flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info aria-hidden className="h-4 w-4" strokeWidth={1.75} />
      </button>
      {open && (
        <span id={id} role="note" className="absolute left-0 top-full z-50 mt-1.5 w-64 max-w-[calc(100vw-3rem)] rounded-xl bg-neu-lift p-3 text-small font-normal normal-case leading-snug tracking-normal text-slate-200 shadow-raised-high ring-1 ring-[rgb(var(--c-s-50)/0.1)]">
          {children}
        </span>
      )}
    </span>
  );
}
