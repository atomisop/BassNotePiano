import Link from "next/link";
import { Check, Lock } from "@/components/ui/appIcons";
import { cn } from "@/lib/utils";

/** The look of one card in a Home shelf: a quiet card, a solid step above the page with no outline. */
export const SHELF_CARD_CLASS =
  "press-soft flex h-full min-h-40 w-full flex-col rounded-card bg-neu-base p-4 text-left shadow-raised-low transition hover:shadow-raised-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
        current && "bg-signal/10 ring-2 ring-inset ring-signal/50 hover:bg-signal/14",
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
