"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TabItem<T extends string> = { id: T; label: ReactNode; count?: number };

/**
 * iOS-style segmented tabs. The active tab is selected state, which is
 * tappable, so it is the one place in the control that uses the signal
 * color. Keyboard: arrow keys move between tabs, Home/End jump to the ends,
 * the way a native tab list behaves.
 */
export function Tabs<const T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  const baseId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent, index: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % items.length;
    if (e.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-ink/[0.08] bg-[rgb(var(--c-s-50)/0.04)] p-1",
        className,
      )}
    >
      {items.map((item, i) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${item.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-small font-semibold transition-[background-color,color,box-shadow] duration-(--dur-fast) ease-(--ease-ios) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-[rgb(var(--signal)/0.14)] text-signal shadow-plane-front"
                : "text-slate-400 hover:text-slate-100",
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cn("tabular-nums", active ? "text-signal" : "text-slate-500")}>{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
