import type { HTMLAttributes } from "react";
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
