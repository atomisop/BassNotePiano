import { cn } from "@/lib/utils";

/**
 * A loading placeholder.
 *
 * `bg-slate-800` rather than an arbitrary alpha: 800 is the ramp's declared
 * "fills, borders" step, so the placeholder sits at the right tonal distance
 * from the ground in every one of the app's themes without a per-theme
 * override, and it avoids the project's reproducible quirk where some
 * arbitrary opacity modifiers compile to nothing.
 *
 * The pulse is `motion-safe:` so a reduced-motion user gets a still block
 * rather than a page of throbbing rectangles, which is exactly the kind of
 * repetitive movement that setting exists to suppress.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("rounded-control bg-neu-base shadow-pressed-low motion-safe:animate-pulse", className)}
    />
  );
}

/**
 * Wraps a skeleton screen so assistive tech announces "loading" once, instead
 * of reading out a wall of meaningless empty boxes. The visual skeleton itself
 * is aria-hidden; this is the only thing a screen reader hears.
 */
export function SkeletonScreen({
  label = "Loading",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
