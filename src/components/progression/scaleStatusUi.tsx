import type { ProgressStatus } from "@prisma/client";
import type { ScaleAccessState } from "@/lib/access";
import { Check, Lock } from "@/components/ui/appIcons";

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

/**
 * The three-item checklist, drawn as a segmented bar rather than three loose
 * dots. A scale is 2/3 done or it isn't, a bar says that at a glance, where
 * three separate dots make the reader count.
 */
export function Checklist({ scale, emphasised }: { scale: ScaleAccessState; emphasised: boolean }) {
  const items = [
    { label: "Module", done: scale.moduleRead },
    { label: "Practice", done: scale.practiceCompleted },
    { label: "Quiz", done: scale.quizPassed },
  ];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5">
        {items.map((item) => (
          <span
            key={item.label}
            className={`h-1 flex-1 rounded-full transition-colors ${
              item.done ? "bg-slate-50" : "bg-neu-base shadow-pressed-low"
            }`}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {items.map((item) => (
            <span
              key={item.label}
              className={`text-small ${
                item.done ? "text-slate-200" : emphasised ? "text-slate-400" : "text-slate-500"
              }`}
            >
              {item.label}
            </span>
          ))}
        </div>
        <span className="text-small tabular-nums text-slate-500">{doneCount}/3</span>
      </div>
    </div>
  );
}
