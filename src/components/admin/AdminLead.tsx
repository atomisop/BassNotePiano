import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "warning" | "danger" | "success";

const FIGURE_TONE: Record<Tone, string> = {
  default: "text-slate-50",
  warning: "text-amber-300",
  danger: "text-red-400",
  success: "text-emerald-400",
};

/**
 * A working list's one fact on one line, figure first (DESIGN.md, "Band, sheet and tiles"): the count or amount big and tabular, what
 * it counts in small words beside it, one quiet line under it, and the screen's side actions at the right. The admin's list screens
 * use this where a full band would push the list too far down a phone; the Overview keeps the one real band.
 */
export function FigureLead({
  figure,
  label,
  meta,
  tone = "default",
  children,
  className,
}: {
  figure: ReactNode;
  /** What the figure counts ("waiting for your approval"). */
  label: ReactNode;
  /** One quiet line under the fact. */
  meta?: ReactNode;
  tone?: Tone;
  /** Side actions (an export, an add button), drawn at the right of the line. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-1", className)}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cn("text-headline font-bold leading-none tabular-nums", FIGURE_TONE[tone])}>{figure}</span>
          <span className="text-small font-medium text-slate-300">{label}</span>
        </p>
        {meta && <div className="mt-1 text-caption text-slate-500">{meta}</div>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** A quiet card holding hairline rows (DESIGN.md rule 6): no outline, a low raised shadow. */
export const QUIET_ROWS = "divide-y divide-slate-50/8 rounded-card bg-neu-base shadow-raised-low";
