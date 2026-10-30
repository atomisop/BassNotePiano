import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "accent" | "neutral";

const DOT: Record<Tone, string> = {
  success: "bg-emerald-400",
  warning: "bg-amber-300",
  danger: "bg-red-400",
  accent: "bg-signal",
  neutral: "bg-slate-500",
};

/**
 * A status as a small colored dot and a word (Active, Overdue, Paused, Email): the one calm status style in the admin, instead of
 * filled, glowing or all-caps pills. The word carries the meaning, so color is never the only signal.
 */
export function StatusDot({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-small font-medium text-slate-200", className)}>
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}
