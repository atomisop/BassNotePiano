"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Siren } from "lucide-react";
import type { SidebarCard } from "@/lib/sidebarCards";
import { SidebarSpotlight } from "@/components/layout/SidebarSpotlight";

/**
 * The admin's alerts, next to the profile picture (md and up): the cards a student sees at the foot of the sidebar (Discord, jobs
 * that stopped, what is waiting, today's classes) moved here because the admin's sidebar holds the admin sections instead. A count
 * shows how many need attention; a tap opens a small window that lists them all. Closes on a tap elsewhere, Escape or a page change.
 */
export function AdminAlertsButton({ cards }: { cards: SidebarCard[] }) {
  const [open, setOpen] = useState(false);
  const [attention, setAttention] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const onAttention = useCallback((n: number) => setAttention(n), []);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={attention > 0 ? `Alerts, ${attention} need you` : "Alerts"}
        title="Alerts"
        className={`tap relative flex h-9 w-9 items-center justify-center rounded-lg bg-neu-base transition ${
          open ? "text-signal-fg shadow-pressed-low" : "text-slate-400 shadow-raised-low hover:text-slate-200 hover:shadow-raised-mid active:shadow-pressed-low"
        }`}
      >
        <Siren className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden />
        {attention > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[0.625rem] font-bold text-slate-950">
            {attention > 9 ? "9+" : attention}
          </span>
        )}
      </button>
      {/* Always mounted (hidden while closed) so the count stays current. */}
      <div
        role="dialog"
        aria-label="Alerts"
        hidden={!open}
        className="absolute right-0 top-full z-50 mt-2 max-h-[min(70vh,34rem)] w-80 overflow-y-auto rounded-card bg-neu-base p-2.5 shadow-raised-high ring-1 ring-slate-50/8"
      >
        <p className="px-1 pb-2 text-small font-semibold text-slate-200">Alerts</p>
        <SidebarSpotlight initial={cards} isAdmin mode="list" onAttention={onAttention} />
      </div>
    </div>
  );
}
