import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "@/components/ui/appIcons";

/** The look every Home row shares (also used by the client rows that open a sheet instead of a page). */
export const HOME_ROW_CLASS =
  "group -mx-3 flex min-h-16 w-[calc(100%+1.5rem)] items-center gap-3.5 rounded-control px-3 py-3 text-left transition hover:bg-slate-50/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A row's inside: a small warm icon, the line, a quieter detail, and whatever sits at the right (a figure, a ring) before the chevron. */
export function HomeRowInner({ icon, title, detail, trailing }: { icon: ReactNode; title: ReactNode; detail?: ReactNode; trailing?: ReactNode }) {
  return (
    <>
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-signal/14 text-signal-fg [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold text-slate-50">{title}</span>
        {detail && <span className="block truncate text-small text-slate-400">{detail}</span>}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
    </>
  );
}

/**
 * One line on Home: no card around it, a hairline between rows (from the list, `HomeRows`), and the whole row opens its page.
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

/** A titled list of rows with hairlines between them. */
export function HomeRows({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-title font-semibold text-slate-50">{title}</h2>
        {aside && <span className="text-small text-slate-400">{aside}</span>}
      </div>
      <ul className="mt-2 divide-y divide-slate-50/8">{children}</ul>
    </section>
  );
}
