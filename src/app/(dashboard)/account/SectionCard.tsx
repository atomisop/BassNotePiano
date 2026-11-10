"use client";

import type { ReactNode } from "react";
import { Hint } from "@/components/ui/Hint";

/**
 * One settings card. It leads with its title and, when there is one, the current value (Verified, On for this device, 3 devices), so
 * the list can be read without opening anything (DESIGN.md, Hierarchy 1 and 3). The value is a quiet line under the title.
 *
 * `advanced` cards start closed behind their title (a native disclosure, so
 * it works without JavaScript and is keyboard and screen reader friendly):
 * options most people never need stay out of the way until asked for.
 */
export function SectionCard({
  title,
  hint,
  value,
  advanced = false,
  children,
}: {
  title: string;
  hint?: string;
  /** The setting's current state, shown under the title (also on a closed card). */
  value?: ReactNode;
  advanced?: boolean;
  children: ReactNode;
}) {
  if (advanced) {
    return (
      <details className="glass-surface group p-5 md:p-6 [&_summary::-webkit-details-marker]:hidden">
        <summary className="tap flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-body font-semibold text-slate-50">{title}</span>
            {value && <span className="mt-0.5 block text-small text-slate-400">{value}</span>}
          </span>
          <span aria-hidden className="shrink-0 text-slate-500 transition group-open:rotate-90">›</span>
        </summary>
        {hint && <p className="mt-2 text-small text-slate-500">{hint}</p>}
        <div className="mt-4">{children}</div>
      </details>
    );
  }
  return (
    <div className="glass-surface p-5 md:p-6">
      <h2 className="flex items-center gap-1 text-title font-semibold text-slate-50">
        {title}
        {hint && <Hint>{hint}</Hint>}
      </h2>
      {value && <p className="mt-0.5 text-small text-slate-400">{value}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}
