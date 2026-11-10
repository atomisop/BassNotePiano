import Link from "next/link";
import type { ReactNode } from "react";
import { Check, Lock } from "@/components/ui/appIcons";
import { HOME_ROW_ICON_CLASS } from "@/components/home/HomeRow";
import { cn } from "@/lib/utils";

/** The look of one card in a Home shelf (also used by the Badges card, which opens a sheet instead of a page). */
export const SHELF_CARD_CLASS =
  "flex h-full min-h-40 w-full flex-col rounded-card bg-slate-50/4 p-4 text-left ring-1 ring-inset ring-slate-50/8 transition hover:bg-slate-50/7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A card's inside: its icon tile, then the line and a quieter detail at the bottom. */
export function ShelfCardInner({ icon, title, detail }: { icon: ReactNode; title: ReactNode; detail?: ReactNode }) {
  return (
    <>
      <span aria-hidden className={HOME_ROW_ICON_CLASS}>
        {icon}
      </span>
      <span className="mt-auto block pt-4 text-body font-semibold leading-snug text-slate-50 line-clamp-2">{title}</span>
      {detail && <span className="mt-1 block min-h-[2.5rem] text-small text-slate-400 line-clamp-2">{detail}</span>}
    </>
  );
}

export function ShelfCard({ href, icon, title, detail }: { href: string; icon: ReactNode; title: ReactNode; detail?: ReactNode }) {
  return (
    <Link href={href} className={SHELF_CARD_CLASS}>
      <ShelfCardInner icon={icon} title={title} detail={detail} />
    </Link>
  );
}

/**
 * One step of the path shelf (Duolingo style): the scale's number in a circle that is ticked when done, lit orange where you are,
 * and locked while it is still closed. An open scale opens its lessons; a closed one opens the Roadmap, which explains why.
 * Only the step you are on is lit (DESIGN.md, Hierarchy rule 3): finished steps are a quiet tick, closed ones quieter still.
 */
export function PathCard({ step, code, title, done, open, current, slug }: { step: number; code: string; title: string; done: boolean; open: boolean; current: boolean; slug: string }) {
  return (
    <Link
      href={open ? `/scales/${slug}` : "/roadmap"}
      aria-current={current ? "step" : undefined}
      aria-label={`${code}, ${title}: ${done ? "done" : current ? "you are here" : open ? "open" : "locked"}`}
      className={cn(
        SHELF_CARD_CLASS,
        "min-h-36",
        current && "bg-signal/10 ring-2 ring-signal/50 hover:bg-signal/14",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full text-body font-bold tabular-nums",
          current ? "bg-signal/20 text-signal-fg ring-2 ring-signal" : done ? "bg-slate-50/8 text-slate-300" : open ? "bg-slate-50/10 text-slate-200" : "bg-slate-50/4 text-slate-500",
        )}
      >
        {done ? <Check className="h-5 w-5" /> : open ? step : <Lock className="h-4 w-4" />}
      </span>
      <span className={cn("mt-auto block pt-4 text-caption font-medium", current ? "text-signal-fg" : "text-slate-500")}>{current ? "You're here" : code}</span>
      <span className={cn("mt-0.5 block text-small font-semibold leading-snug line-clamp-2", current ? "text-slate-50" : done ? "text-slate-300" : open ? "text-slate-100" : "text-slate-400")}>
        {title}
      </span>
    </Link>
  );
}
