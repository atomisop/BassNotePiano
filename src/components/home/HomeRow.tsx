import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "@/components/ui/appIcons";
import { cn } from "@/lib/utils";

/** The look every Home row shares (also used by the client rows that open a sheet instead of a page). */
export const HOME_ROW_CLASS =
  "group flex min-h-16 w-full items-center gap-3.5 px-4 py-3 text-left transition hover:bg-slate-50/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/** The icon tile at the start of a row: a small rounded square with a soft orange tint, the same as on the action tiles. */
export const HOME_ROW_ICON_CLASS =
  "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-signal/16 text-signal-fg [&_svg]:h-5 [&_svg]:w-5";

/** A row's inside: a small warm icon, the line, a quieter detail, and whatever sits at the right (a figure, a ring) before the chevron. */
export function HomeRowInner({ icon, title, detail, trailing }: { icon: ReactNode; title: ReactNode; detail?: ReactNode; trailing?: ReactNode }) {
  return (
    <>
      <span aria-hidden className={HOME_ROW_ICON_CLASS}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-body font-semibold leading-snug text-slate-50">{title}</span>
        {detail && <span className="block truncate text-small text-slate-500">{detail}</span>}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
    </>
  );
}

/**
 * One line on Home: inside its section's panel, a hairline between rows (from the list, `HomeRows`), and the whole row opens its page.
 */
export function HomeRow({ href, external, ...inner }: { href: string; external?: boolean; icon: ReactNode; title: ReactNode; detail?: ReactNode; trailing?: ReactNode }) {
  return external ? (
    <a href={href} className={HOME_ROW_CLASS}>
      <HomeRowInner {...inner} />
    </a>
  ) : (
    <Link href={href} className={HOME_ROW_CLASS}>
      <HomeRowInner {...inner} />
    </Link>
  );
}

/**
 * A group of rows: one quiet card (DESIGN.md, "Band, sheet and tiles" 6: a solid step above the page, no outline) with hairlines
 * between the rows, like a grouped list on a phone. Its heading is a small quiet label, the same as the tiles' (`ActionTiles`), so
 * the hero stays the only loud thing on Home. Without a `title` the card stands alone under whatever it belongs to; give `label`
 * then, so it still has a name for screen readers.
 */
export function HomeRows({ title, label, aside, children, className }: { title?: string; label?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title ?? label} className={cn("min-w-0", className)}>
      {(title || aside) && (
        <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
          {title && <h2 className="text-caption font-medium uppercase tracking-caps text-slate-500">{title}</h2>}
          {aside && <span className="text-small text-slate-400">{aside}</span>}
        </div>
      )}
      <ul data-stagger="" className="divide-y divide-slate-50/8 overflow-hidden rounded-card bg-neu-base shadow-raised-low">{children}</ul>
    </section>
  );
}
