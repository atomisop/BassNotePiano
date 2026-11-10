import Link from "next/link";
import { TAB_TRACK, tabItem } from "@/components/ui/tabStyles";

type Params = Record<string, string | string[] | undefined>;

/**
 * The pills that switch between the views one admin page holds (Prices and Scholarships, Lessons and Roadmaps, ...). Two pages that
 * used to be two tabs are one page now, with each view at `?section=<value>`; the first item is the page's own view and has no
 * parameter. Nothing else in the address is kept, because a filter belongs to the view it was set in.
 */
export function SectionPills({ base, active, items, label }: { base: string; active: string | null; items: { label: string; value: string | null }[]; label: string }) {
  return (
    <nav aria-label={label} className="mt-6">
      <div className={TAB_TRACK}>
        {items.map((item) => (
          <Link key={item.label} href={item.value ? `${base}?section=${item.value}` : base} aria-current={active === item.value ? "page" : undefined} className={tabItem(active === item.value)}>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** A merged page's old address: opens the right view of the page that holds it now, keeping the filters the link carried. */
export function intoParams(sp: Params, extra: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key in extra) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value !== undefined) params.set(key, value);
  }
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return params.toString();
}
