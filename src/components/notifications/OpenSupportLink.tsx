"use client";

import { OPEN_SUPPORT, announce } from "@/lib/topBarEvents";

/** A text link that opens the bell on its Support tab, where the person can write to the team. */
export function OpenSupportLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => announce(OPEN_SUPPORT)} className={className ?? "text-slate-50 underline hover:opacity-70"}>
      Message support
    </button>
  );
}
