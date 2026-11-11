"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TAB_TRACK, tabItem } from "@/components/ui/tabStyles";
import { cn } from "@/lib/utils";

export interface AdminFilterItem {
  label: string;
  href: string;
  active: boolean;
  /** Longer text for the phone dropdown, where there is room for it. Falls back to `label`. */
  selectLabel?: string;
  /** An icon for the pill, shown before its name when the control has `iconOnly`. */
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
  inline = false,
}: {
  items: AdminFilterItem[];
  label: string;
  mobile?: "select" | "scroll";
  /** "select" keeps one dropdown at every width, for long lists where a pill row is a wall of buttons. */
  desktop?: "pills" | "select";
  /** Every pill shows its icon before its name (the name is always shown: an icon alone is unguessable). Needs an `icon` on each item. */
  iconOnly?: boolean;
  /** Only the track, at every width, for a caller that puts it in its own sideways-scrolling row next to another control. */
  inline?: boolean;
}) {
  const router = useRouter();
  const current = items.find((i) => i.active) ?? items[0];
  const rootRef = useRef<HTMLSpanElement>(null);

  // The chosen pill is brought into view when the page opens, so a long row (People has ten) never hides where you are.
  const activeHref = current?.href;
  useEffect(() => {
    const root = rootRef.current?.parentElement;
    if (!root) return;
    root.querySelectorAll<HTMLElement>(`a[data-filter-pill][aria-current="page"]`).forEach((el) => {
      if (el.offsetParent === null) return; // the copy for the other screen size
      el.scrollIntoView({ inline: "center", block: "nearest" });
    });
  }, [activeHref]);

  // Every pill shows its icon AND its name: an icon alone is a guess. The row scrolls sideways when it is longer than the screen.
  const pills = items.map((item) => {
    const showIcon = iconOnly && item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        data-filter-pill=""
        aria-current={item.active ? "page" : undefined}
        aria-label={item.badge ? `${item.label}, ${item.badge} waiting` : undefined}
        className={showIcon ? `${tabItem(item.active)} sm:px-3.5` : tabItem(item.active)}
      >
        {showIcon && <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>}
        {item.label}
        {showIcon && !!item.badge && (
          <span aria-hidden className="min-w-4 rounded-full bg-signal px-1 text-center text-[10px] font-semibold leading-4 tabular-nums text-white">
            {item.badge}
          </span>
        )}
      </Link>
    );
  });

  if (inline) {
    return (
      <>
        <span ref={rootRef} hidden />
        <nav aria-label={label} className={cn(TAB_TRACK, "w-max max-w-none shrink-0 overflow-visible")}>
          {pills}
        </nav>
      </>
    );
  }

  return (
    <>
      <span ref={rootRef} hidden />
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
