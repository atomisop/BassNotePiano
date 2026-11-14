import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * The card: the 21st.dev "Liquid Glass Login" card (Rule 1, docs/glass-revamp/DESIGN-SYSTEM.md). The glass is a layer behind the
 * content (`lgx-card` in globals.css), so buttons and fields inside it still bend the page behind the card.
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
        "lgx-card relative rounded-card shadow-raised-mid",
        padded && "p-(--space-card) md:p-5",
        interactive &&
          "press-soft hover:shadow-raised-high active:shadow-pressed-mid",
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
      className={cn("text-small font-semibold uppercase tracking-caps text-slate-400", className)}
      {...props}
    />
  );
}
