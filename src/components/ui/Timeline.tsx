import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TimelineEntry {
  /** Short marker, e.g. "01". Falls back to the index. */
  marker?: string;
  title: string;
  /** A plain string renders identically to before. A richer node (chips,
   *  scroll-linked text, formula rows) is also valid — widened for
   *  KinitJourney's use, which needs more than a paragraph per entry. */
  description: ReactNode;
  icon?: ReactNode;
}

/**
 * #10 — Narrative timeline for the marketing "how this works" sequence.
 *
 * An ordered list, not a stack of divs: the numbering is the content here, so
 * it belongs in the markup rather than only in a styled span. The connecting
 * rule is drawn with a border on the marker column and hidden from assistive
 * tech, since it carries no information a list doesn't already imply.
 */
export function Timeline({
  entries,
  className,
}: {
  entries: TimelineEntry[];
  className?: string;
}) {
  return (
    <ol className={cn("relative", className)}>
      {entries.map((entry, i) => {
        const last = i === entries.length - 1;
        return (
          <li key={entry.title} className="flex gap-5">
            <div className="flex flex-col items-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--c-s-50)/0.3)] bg-[rgb(var(--c-s-50))]/[0.07] font-mono text-small tracking-[0.08em] text-[rgb(var(--c-s-50))]">
                {entry.icon ?? entry.marker ?? String(i + 1).padStart(2, "0")}
              </span>
              {!last && <span aria-hidden className="w-px flex-1 bg-ink/10" />}
            </div>

            <div className={cn("pb-10", last && "pb-0")}>
              <h3 className="text-body text-slate-50 font-semibold">{entry.title}</h3>
              {/* A <div>, not a <p> — description is typed ReactNode now,
                  and a rich entry (KinitJourney passes a <div> for its
                  scroll-tracking ref) can legally contain block children
                  like a nested <div>; a <p> cannot without triggering a
                  hydration mismatch, which this deliberately avoids. */}
              <div className="mt-2 max-w-prose text-body text-slate-300">
                {entry.description}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
