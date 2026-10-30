"use client";

import { useEffect, useState } from "react";
import { PartyPopper, X } from "@/components/ui/appIcons";
import { Celebrate } from "@/components/ui/Celebrate";

/**
 * A recent win (a new badge, a scale the teacher opened, a streak goal), shown once with a burst of confetti. Closing it hides that
 * win for good on this device. Nothing shows until the browser has checked, so a closed win never flashes back.
 */
export function CelebrationCard({ win }: { win: { key: string; title: string; detail: string } }) {
  const storageKey = `bnp-celebrated-${win.key}`;
  const [state, setState] = useState<"checking" | "show" | "hidden">("checking");
  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(storageKey) === "1";
    } catch {
      // Storage blocked: show it; closing still hides it for this visit.
    }
    setState(seen ? "hidden" : "show");
  }, [storageKey]);

  if (state !== "show") return null;
  const close = () => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Nothing to remember it in; it is still closed for now.
    }
    setState("hidden");
  };
  return (
    <div role="status" className="relative flex items-start gap-3 rounded-card bg-signal/14 p-4 md:p-5">
      <Celebrate />
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-signal/20 text-signal-fg">
        <PartyPopper className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-slate-50">{win.title}</p>
        {win.detail && <p className="mt-0.5 text-small text-slate-300">{win.detail}</p>}
      </div>
      <button type="button" onClick={close} aria-label="Close" className="tap -m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-slate-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
