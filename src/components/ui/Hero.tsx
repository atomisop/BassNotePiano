import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The ONE huge element on a screen (STEP 2C, rule 3). Everything else on the
 * screen stays small. Uses the display face; scales smoothly from phone to
 * desktop through the clamp() in --text-hero, and balances its line breaks
 * so it never leaves a single orphaned word.
 */
export function Hero({
  as: Tag = "h1",
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { as?: "h1" | "h2" | "p" }) {
  return (
    <Tag
      className={cn("font-hero text-hero font-bold text-balance text-slate-50", className)}
      {...props}
    />
  );
}

/**
 * The back plane (STEP 2C, rule 1): very large, very quiet type sitting
 * behind the content, which slightly overlaps it. Purely decorative, so it
 * is hidden from screen readers. On phones it shrinks and fades further so
 * it never competes with text that has to be read.
 *
 * Place it as the first child of a `relative` container; the content after
 * it should be `relative` too so it sits on the middle plane.
 */
export function BackPlane({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 -top-4 z-(--z-back) select-none overflow-hidden whitespace-nowrap font-hero font-bold leading-none tracking-[-0.04em]",
        "engraved text-[clamp(4rem,14vw,13rem)] max-md:opacity-60",
        className,
      )}
    >
      {children}
    </div>
  );
}
