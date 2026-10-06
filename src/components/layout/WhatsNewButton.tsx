"use client";

import { Lightbulb } from "lucide-react";
import { useWhatsNew } from "./WhatsNewProvider";

/** Tiny bulb in the top bar: brings the What's new card back after "Got it". */
export function WhatsNewButton() {
  const whatsNew = useWhatsNew();
  if (!whatsNew) return null;
  return (
    <button
      type="button"
      onClick={whatsNew.open}
      aria-label="What's new"
      title="What's new"
      className="tap flex h-9 w-9 items-center justify-center rounded-lg bg-neu-base text-slate-400 shadow-raised-low transition hover:text-slate-200 hover:shadow-raised-mid active:shadow-pressed-low"
    >
      <Lightbulb className="h-[18px] w-[18px]" strokeWidth={1.5} />
    </button>
  );
}
