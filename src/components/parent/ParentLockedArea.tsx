"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ShieldCheck } from "@/components/ui/appIcons";

/**
 * A child whose parent controls the schedule sees the screen with every button switched off and a plain line on top. The server refuses
 * the same actions too (see hasParentControl), so this is only the honest face of it.
 */
export function ParentLockedArea({ locked, children }: { locked: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // React 18 has no `inert` prop; the attribute switches off focus, clicks and screen readers for everything inside.
  useEffect(() => {
    ref.current?.toggleAttribute("inert", locked);
  }, [locked, children]);
  if (!locked) return <>{children}</>;
  return (
    <>
      <p role="status" className="mb-4 flex items-center gap-2.5 rounded-xl bg-neu-base px-4 py-3 text-small font-medium text-slate-100 shadow-raised-low">
        <ShieldCheck aria-hidden className="h-4 w-4 shrink-0 text-signal-fg" />
        Your schedule is controlled by your parent.
      </p>
      <div ref={ref} aria-disabled className="pointer-events-none select-none opacity-60">
        {children}
      </div>
    </>
  );
}
