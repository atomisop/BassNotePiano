import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export interface Step {
  title: string;
  description?: string;
}

/**
 * #7 — Step indicator for multi-step flows (the onboarding wizard).
 *
 * Rendered as an ordered list with `aria-current="step"` on the active item,
 * so the structure a screen reader hears matches what's on screen — a bare
 * row of styled divs communicates nothing about sequence or position.
 *
 * The connector between markers is solid behind completed steps and faint
 * ahead of them, the same progress-carrying spine used by the curriculum
 * roadmap, so the two read as one language.
 */
export function Stepper({
  steps,
  current,
  className,
  orientation = "vertical",
}: {
  steps: Step[];
  /** Zero-based index of the active step. */
  current: number;
  className?: string;
  orientation?: "vertical" | "horizontal";
}) {
  if (orientation === "horizontal") {
    return (
      <ol className={cn("flex w-full items-center", className)}>
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={step.title}
              className={cn("flex items-center", i < steps.length - 1 && "flex-1")}
              aria-current={active ? "step" : undefined}
            >
              <Marker index={i} done={done} active={active} />
              <span
                className={cn(
                  "ml-2 hidden whitespace-nowrap text-xs font-medium sm:inline",
                  active ? "text-slate-50" : done ? "text-slate-400" : "text-slate-600",
                )}
              >
                {step.title}
              </span>
              {i < steps.length - 1 && (
                <span
                  className={cn(
                    "mx-3 h-px flex-1",
                    done ? "bg-emerald-400/40" : "bg-ink/10",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className={cn("space-y-0", className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const last = i === steps.length - 1;
        return (
          <li key={step.title} className="flex gap-3" aria-current={active ? "step" : undefined}>
            <div className="flex flex-col items-center">
              <Marker index={i} done={done} active={active} />
              {!last && (
                <span
                  className={cn(
                    "w-px flex-1 border-l-2",
                    done ? "border-solid border-emerald-400/40" : "border-dotted border-ink/10",
                  )}
                />
              )}
            </div>
            <div className={cn("pb-6", last && "pb-0")}>
              <p
                className={cn(
                  "text-sm font-medium",
                  active ? "text-slate-50" : done ? "text-slate-300" : "text-slate-500",
                )}
              >
                {step.title}
              </p>
              {step.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{step.description}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Marker({ index, done, active }: { index: number; done: boolean; active: boolean }) {
  if (done) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-slate-950">
        <CheckIcon size={13} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        active
          ? "bg-[rgb(var(--c-a-400))] text-slate-950"
          : "border-2 border-ink/10 bg-slate-950 text-slate-500",
      )}
    >
      {index + 1}
    </span>
  );
}
