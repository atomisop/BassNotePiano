import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ActionTile {
  href: string;
  label: string;
  /** One quiet line: what it is, or its current value. */
  detail: string;
  icon: ReactNode;
  /** A small orange count on the tile (things waiting). */
  badge?: number;
}

/**
 * A row of tiles for the few things people do from a screen, each one tap (DESIGN.md, "Band, sheet and tiles"): a soft card with a
 * tinted icon, the name bold, one quiet line under it. Two across on a phone, up to four on a computer. Use two to four; more than
 * that belongs in a list.
 */
export function ActionTiles({ title, items, className }: { title: string; items: ActionTile[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className={className}>
      <h2 className="px-1 text-caption font-medium uppercase tracking-caps text-slate-500">{title}</h2>
      <ul className={cn("mt-3 grid grid-cols-2 gap-3", items.length >= 4 ? "sm:grid-cols-4" : items.length === 3 ? "sm:grid-cols-3" : "")}>
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="tap press group relative flex h-full flex-col gap-3 rounded-card bg-neu-base p-4 shadow-raised-low transition hover:shadow-raised-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-control bg-signal/16 text-signal-fg [&>svg]:h-6 [&>svg]:w-6">
                {item.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-body font-semibold text-slate-50">{item.label}</span>
                <span className="mt-0.5 block text-caption text-slate-500">{item.detail}</span>
              </span>
              {!!item.badge && (
                <span className="absolute right-3 top-3 min-w-6 rounded-full bg-signal px-1.5 py-0.5 text-center text-caption font-semibold tabular-nums text-white">
                  {item.badge}
                  <span className="sr-only"> waiting</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
