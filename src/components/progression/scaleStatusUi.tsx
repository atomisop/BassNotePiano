import type { ProgressStatus } from "@prisma/client";
import type { ScaleAccessState } from "@/lib/access";
import { Check, Lock } from "@/components/ui/appIcons";
import { StatusDot } from "@/components/ui/StatusDot";
import { cn } from "@/lib/utils";

// Shared between ScaleCardGrid and ScaleListRows so the grid/list toggle in
// ScaleRoadmap.tsx renders the exact same status vocabulary either way.

export const STATUS_LABEL: Record<ProgressStatus, string> = {
  LOCKED: "Locked",
  AVAILABLE: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

export function LockIcon({ className }: { className?: string }) {
  return (
    <Lock className={className ?? "shrink-0"} size={14} />
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <Check className={className ?? "shrink-0"} size={14} />
  );
}

/** What a scale card or row says about where the scale stands. Null for a plain open scale (its "Start" already says it). */
export type ScaleState = { label: string; tone: "accent" | "success" | "neutral" | "locked" };

/**
 * One state per scale, the words the grid and the list both use (DESIGN.md, Hierarchy rule 5: status only when it is news). A scale
 * the teacher has not opened yet says so, instead of a bare "Locked".
 */
export function scaleState(scale: ScaleAccessState, isCurrent: boolean): ScaleState | null {
  if (isCurrent) return { label: "You're here", tone: "accent" };
  if (scale.status === "COMPLETED") return { label: "Done", tone: "success" };
  if (!scale.canAccess) return { label: scale.lockedBecause === "not-yet-approved" ? "Waiting for teacher" : "Locked", tone: "locked" };
  if (scale.status === "IN_PROGRESS") return { label: STATUS_LABEL.IN_PROGRESS, tone: "neutral" };
  return null;
}

/** A scale's state as one quiet word: a dot for the live states, a lock for the closed ones. */
export function ScaleStateLabel({ state, className }: { state: ScaleState; className?: string }) {
  if (state.tone === "locked") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-small font-medium text-slate-400", className)}>
        <LockIcon />
        {state.label}
      </span>
    );
  }
  return (
    <StatusDot tone={state.tone} className={cn(state.tone === "accent" && "text-signal-fg", className)}>
      {state.label}
    </StatusDot>
  );
}

const STEPS = ["Module", "Practice", "Quiz"] as const;

/**
 * The three-step checklist as one figure: a segmented bar and "2/3" (DESIGN.md, Hierarchy rule 1). The scale you are on also says
 * which step is next, in one quiet line; the other cards leave it at the figure.
 */
export function Checklist({ scale, emphasised }: { scale: ScaleAccessState; emphasised: boolean }) {
  const done = [scale.moduleRead, scale.practiceCompleted, scale.quizPassed];
  const doneCount = done.filter(Boolean).length;
  const next = STEPS[done.indexOf(false)];

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-1.5" aria-hidden>
          {done.map((d, i) => (
            <span key={STEPS[i]} className={cn("h-1 flex-1 rounded-full transition-colors", d ? "bg-slate-50" : "bg-neu-base shadow-pressed-low")} />
          ))}
        </div>
        <span className="shrink-0 text-small font-semibold tabular-nums text-slate-300">
          {doneCount}/3<span className="sr-only"> steps done</span>
        </span>
      </div>
      {emphasised && next && <p className="mt-1.5 text-caption text-slate-400">Next: {next}</p>}
    </div>
  );
}
