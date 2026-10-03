import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * The middle-plane surface: the subject a screen is about (a scale, a
 * lesson, a chat). Depth comes from a soft shadow, not a heavy border.
 *
 * - `interactive`: the whole card is tappable, so it lifts on hover.
 * - `selected`: the one chosen card. Selection is tappable state, so it is
 *   the only card treatment allowed to use the signal color.
 * - `muted`: locked or disabled. Always gray, never green.
 */
type CardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  selected?: boolean;
  muted?: boolean;
  padded?: boolean;
};

export function Card({ interactive, selected, muted, padded = true, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "relative rounded-card bg-neu-base shadow-raised-mid",
        padded && "p-(--space-card) md:p-6",
        interactive &&
          "transition-[box-shadow] duration-(--dur-base) ease-(--ease-ios) hover:shadow-raised-high active:shadow-pressed-mid",
        selected && "shadow-pressed-mid ring-1 ring-signal",
        muted && "opacity-60 shadow-pressed-low",
        className,
      )}
      {...props}
    />
  );
}

/** Small uppercase label that groups content instead of a mid-size heading. */
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-small font-semibold uppercase tracking-[0.16em] text-slate-400", className)}
      {...props}
    />
  );
}
