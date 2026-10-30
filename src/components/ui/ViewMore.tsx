"use client";

import { useState } from "react";
import { ChevronDown } from "@/components/ui/appIcons";

/**
 * A long list that shows its first few rows and a "View N more" button for the rest, so a page never scrolls forever.
 * Sort the items before passing them: the first ones shown are the ones that matter most.
 */
export function ViewMore<T>({
  items,
  initial = 5,
  step = 10,
  children,
}: {
  items: T[];
  initial?: number;
  /** How many more rows each tap reveals. */
  step?: number;
  children: (item: T, index: number) => React.ReactNode;
}) {
  const [shown, setShown] = useState(initial);
  const visible = items.slice(0, shown);
  const left = items.length - visible.length;
  return (
    <>
      {visible.map((item, i) => children(item, i))}
      {(left > 0 || shown > initial) && (
        <div className="flex justify-center gap-2 pt-1">
          {left > 0 && (
            <button
              type="button"
              onClick={() => setShown((n) => n + step)}
              className="tap inline-flex items-center gap-1 rounded-full bg-neu-base px-3 py-1.5 text-small font-medium text-slate-300 shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low"
            >
              View {Math.min(step, left)} more{left > step ? ` (${left} left)` : ""}
              <ChevronDown aria-hidden className="h-3.5 w-3.5" />
            </button>
          )}
          {shown > initial && left <= 0 && (
            <button type="button" onClick={() => setShown(initial)} className="tap rounded-full px-3 py-1.5 text-small font-medium text-slate-500 hover:text-slate-300">
              Show less
            </button>
          )}
        </div>
      )}
    </>
  );
}
