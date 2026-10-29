import { Fragment } from "react";
import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export interface Step {
  title: string;
  description?: string;
}

/**
 * #7, Step indicator for multi-step flows (the onboarding wizard).
 *
 * Rendered as an ordered list with `aria-current="step"` on the active item,
 * so the structure a screen reader hears matches what's on screen, a bare
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
          const last = i === steps.length - 1;
          return (
            // The connector used to live *inside* this <li>, competing with
            // this step's own label for space inside one equally-divided
            // slot, a long label like "Your instrument" left it nothing to
            // grow into, so it rendered at a real, measured 0px wide, not
            // just visually thin. It's a separate <li> now: a true sibling
            // flex item of <ol>, so it grows into whatever's actually left
            // over in the row instead of whatever's left over in one
            // label's own cramped box. aria-hidden, it carries no content a
            // screen reader needs, and keeps the list's announced item
            // count at the real number of steps, not steps-plus-connectors.
            //
            // Only the active step's label is ever shown, not a viewport
            // check (`sm:inline`, as this used to be): the wizard's own card
            // is a fixed ~28rem regardless of how wide the screen around it
            // is, so a screen-width breakpoint never actually fires here.
            // All five full labels genuinely don't fit that card width at
            // once, showing every label was the reason nothing was left
            // for the connector even before the nesting bug above. One
            // visible label at a time always fits, and the big heading
            // right below the row already repeats the current step's full
            // name, every step's label still reaches a screen reader via
            // sr-only, just not painted for the ones not being read.
            <Fragment key={step.title}>
              <li className="flex shrink-0 items-center" aria-current={active ? "step" : undefined}>
                <Marker index={i} done={done} active={active} />
                <span className={cn("ml-2 whitespace-nowrap text-small font-medium text-slate-50", !active && "sr-only")}>
                  {step.title}
                </span>
              </li>
              {!last && (
                <li
                  aria-hidden
                  className={cn("mx-3 h-px flex-1", done ? "bg-slate-50/40" : "bg-ink/10")}
                />
              )}
            </Fragment>
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
                    done ? "border-solid border-slate-50/40" : "border-dotted border-ink/10",
                  )}
                />
              )}
            </div>
            <div className={cn("pb-6", last && "pb-0")}>
              <p
                className={cn(
                  "text-small font-medium",
                  active ? "text-slate-50" : done ? "text-slate-300" : "text-slate-500",
                )}
              >
                {step.title}
              </p>
              {step.description && (
                <p className="mt-0.5 text-small text-slate-500">{step.description}</p>
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
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-950">
        <CheckIcon size={13} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-small font-semibold",
        active
          ? "bg-slate-50 text-slate-950"
          : "border-2 border-ink/10 bg-slate-950 text-slate-500",
      )}
    >
      {index + 1}
    </span>
  );
}
