"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export interface AdminFilterItem {
  label: string;
  href: string;
  active: boolean;
  /** Longer text for the phone dropdown, where there is room for it. Falls back to `label`. */
  selectLabel?: string;
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
}: {
  items: AdminFilterItem[];
  label: string;
  mobile?: "select" | "scroll";
}) {
  const router = useRouter();
  const current = items.find((i) => i.active) ?? items[0];

  const pills = items.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={item.active ? "page" : undefined}
      className={`tap inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-small font-medium transition ${
        item.active ? "bg-[rgb(var(--signal)/0.14)] text-signal" : "text-slate-400 hover:text-slate-100"
      }`}
    >
      {item.label}
    </Link>
  ));

  return (
    <>
      {mobile === "select" ? (
        <select
          value={current.href}
          onChange={(e) => router.push(e.target.value)}
          aria-label={label}
          className="glass-surface-subtle w-full rounded-xl px-3 py-2.5 text-body font-medium text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)] sm:hidden"
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
          <div className="flex w-max gap-1 rounded-full bg-neu-base p-1 shadow-pressed-low">{pills}</div>
        </nav>
      )}
      <nav aria-label={label} className="hidden w-fit flex-wrap gap-1.5 rounded-full bg-neu-base p-1 shadow-pressed-low sm:flex">
        {pills}
      </nav>
    </>
  );
}
