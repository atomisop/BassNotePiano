"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TAB_TRACK, tabItem } from "@/components/ui/tabStyles";

export interface AdminFilterItem {
  label: string;
  href: string;
  active: boolean;
  /** Longer text for the phone dropdown, where there is room for it. Falls back to `label`. */
  selectLabel?: string;
  /** An icon for the pill. With `iconOnly` on the control, only the chosen pill shows its words; the others are just their icon. */
  icon?: ReactNode;
  /** A small orange count on the pill (waiting items). Read out with the label for screen readers. */
  badge?: number;
}

/**
 * One filter control for the admin list pages. Desktop keeps the pill row.
 * On phones a row of 6 to 15 pills wraps into a cluster, so it becomes either
 * a native select ("select", for long lists like the 15 scales) or a single
 * swipeable row that never wraps ("scroll", for a handful of statuses).
 * Selects stay text-body (16px) so iOS doesn't zoom the fixed app shell.
 */
export function AdminFilterTabs({
  items,
  label,
  mobile = "scroll",
  desktop = "pills",
  iconOnly = false,
}: {
  items: AdminFilterItem[];
  label: string;
  mobile?: "select" | "scroll";
  /** "select" keeps one dropdown at every width, for long lists where a pill row is a wall of buttons. */
  desktop?: "pills" | "select";
  /** Every pill is an icon (with its name as a tooltip and for screen readers); the chosen one also shows its name. Needs an `icon` on each item. */
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const current = items.find((i) => i.active) ?? items[0];

  const pills = items.map((item) => {
    const showIcon = iconOnly && item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={item.active ? "page" : undefined}
        aria-label={showIcon ? `${item.label}${item.badge ? `, ${item.badge} waiting` : ""}` : undefined}
        title={showIcon ? item.label : undefined}
        className={showIcon && !item.active ? `${tabItem(false)} relative w-11 justify-center px-0 sm:px-0` : tabItem(item.active)}
      >
        {showIcon && <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center [&>svg]:h-5 [&>svg]:w-5">{item.icon}</span>}
        {(!showIcon || item.active) && item.label}
        {showIcon && item.active && !!item.badge && <span className="tabular-nums">({item.badge})</span>}
        {showIcon && !item.active && !!item.badge && (
          <span aria-hidden className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-signal px-1 text-center text-[10px] font-semibold leading-4 tabular-nums text-white">
            {item.badge}
          </span>
        )}
      </Link>
    );
  });

  return (
    <>
      {mobile === "select" || desktop === "select" ? (
        <select
          value={current.href}
          onChange={(e) => router.push(e.target.value)}
          aria-label={label}
          className={`h-11 w-full rounded-control bg-neu-base px-4 text-body font-medium text-slate-100 shadow-pressed-low outline-none transition focus-visible:ring-2 focus-visible:ring-ring ${desktop === "select" ? "sm:max-w-sm" : "sm:hidden"}`}
        >
          {items.map((item) => (
            <option key={item.href} value={item.href}>
              {item.selectLabel ?? item.label}
            </option>
          ))}
        </select>
      ) : (
        <nav
          aria-label={label}
          className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden"
        >
          <div className={`${TAB_TRACK} w-max`}>{pills}</div>
        </nav>
      )}
      {desktop === "pills" && (
        <nav aria-label={label} className={`${TAB_TRACK} max-sm:hidden`}>
          {pills}
        </nav>
      )}
    </>
  );
}
