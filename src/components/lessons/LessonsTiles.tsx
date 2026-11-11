import Link from "next/link";
import type { ReactNode } from "react";

export interface LessonTile {
  href: string;
  label: string;
  detail: string;
  icon: ReactNode;
}

/**
 * "What do you want to do?": the few things a student does from Lessons, each a tap. A soft tile with a tinted icon, the name bold and
 * one quiet line under it (the same card language as the favourites on a super-app home screen).
 */
export function LessonsTiles({ items, className }: { items: LessonTile[]; className?: string }) {
  return (
    <section aria-label="What do you want to do?" className={className}>
      <h2 className="px-1 text-caption font-medium uppercase tracking-caps text-slate-500">What do you want to do?</h2>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="tap press group flex h-full flex-col gap-3 rounded-card bg-neu-base p-4 shadow-raised-low transition hover:shadow-raised-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-control bg-signal/16 text-signal-fg [&>svg]:h-6 [&>svg]:w-6">
                {item.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-body font-semibold text-slate-50">{item.label}</span>
                <span className="mt-0.5 block text-caption text-slate-500">{item.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
