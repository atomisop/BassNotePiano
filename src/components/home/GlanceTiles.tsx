import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Glance = {
  href: string;
  label: string;
  icon: ReactNode;
  /** The figure itself, and a short unit after it ("days", "min"). */
  value: string;
  unit?: string;
  /** One quiet line under the figure. */
  hint?: string;
  /** A small chart along the bottom: one bar per value, the last one (or `current`) drawn in full orange. */
  bars?: { values: number[]; current?: number; label: string };
  /** A thin meter along the bottom, from 0 to `max`. */
  meter?: { value: number; max: number; label: string };
  /** Draws the figure in orange: something is waiting. */
  alert?: boolean;
};

/**
 * Three figures under the hero, at a glance (Home and the admin Overview): each a small panel with its icon and label, one big number,
 * a quiet line and a tiny chart, so the page has something to read before the rows without turning back into a wall of cards. Every
 * tile opens the page behind it.
 */
export function GlanceTiles({ items, className }: { items: Glance[]; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-3 gap-2.5 sm:gap-3", className)}>
      {items.map((g) => (
        <li key={g.label} className="min-w-0">
          <Link
            href={g.href}
            className="group flex h-full min-w-0 flex-col rounded-card bg-slate-50/4 p-3 ring-1 ring-inset ring-slate-50/8 transition hover:bg-slate-50/7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-caption font-medium text-slate-400">
              <span aria-hidden className="shrink-0 text-signal-fg [&_svg]:h-3.5 [&_svg]:w-3.5">
                {g.icon}
              </span>
              <span className="truncate">{g.label}</span>
            </span>
            <span className="mt-2 flex min-w-0 items-baseline gap-1">
              <span className={cn("truncate text-headline font-bold leading-none tabular-nums", g.alert ? "text-signal-fg" : "text-slate-50")}>{g.value}</span>
              {g.unit && <span className="shrink-0 text-small text-slate-400">{g.unit}</span>}
            </span>
            {g.hint && <span className="mt-1 truncate text-caption text-slate-500">{g.hint}</span>}
            <span className="mt-auto block pt-3">
              {g.bars && <MiniBars {...g.bars} />}
              {g.meter && <Meter {...g.meter} />}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MiniBars({ values, current, label }: { values: number[]; current?: number; label: string }) {
  const max = Math.max(1, ...values);
  const at = current ?? values.length - 1;
  return (
    <span role="img" aria-label={label} className="flex h-6 items-end gap-[3px]">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn("block flex-1 rounded-[2px]", i === at ? "bg-signal" : v > 0 ? "bg-signal/40" : "bg-slate-50/10")}
          style={{ height: `${Math.max(12, Math.round((v / max) * 100))}%` }}
        />
      ))}
    </span>
  );
}

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, max > 0 ? value / max : 0)) * 100);
  return (
    <span role="img" aria-label={label} className="block h-1.5 overflow-hidden rounded-full bg-slate-50/10">
      <span className="block h-full origin-left rounded-full bg-signal" style={{ transform: `scaleX(${pct / 100})` }} />
    </span>
  );
}
