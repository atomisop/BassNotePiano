"use client";

import { Hint } from "@/components/ui/Hint";

/**
 * `advanced` cards start closed behind their title (a native disclosure, so
 * it works without JavaScript and is keyboard and screen reader friendly):
 * options most people never need stay out of the way until asked for.
 */
export function SectionCard({ title, hint, advanced = false, children }: { title: string; hint?: string; advanced?: boolean; children: React.ReactNode }) {
  if (advanced) {
    return (
      <details className="glass-surface group p-6 [&_summary::-webkit-details-marker]:hidden">
        <summary className="tap flex cursor-pointer list-none items-center justify-between gap-2 text-body font-semibold text-slate-50">
          {title}
          <span aria-hidden className="text-slate-400 transition group-open:rotate-90">›</span>
        </summary>
        {hint && <p className="mt-2 text-small text-slate-400">{hint}</p>}
        <div className="mt-4">{children}</div>
      </details>
    );
  }
  return (
    <div className="glass-surface p-6">
      <h2 className="flex items-center gap-1 text-title text-slate-50 font-semibold">
        {title}
        {hint && <Hint>{hint}</Hint>}
      </h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}
