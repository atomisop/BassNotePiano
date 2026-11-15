import { cn } from "@/lib/utils";

/**
 * A loading placeholder in the familiar video-site style: a soft block with a lighter band that sweeps across it, left to right,
 * on a loop. The look and the motion live in `.skeleton` (globals.css), where the sweep is switched off for anyone who asks for
 * reduced motion, leaving a still block. Shape it with the class you pass (size, radius); the helpers below cover the shapes that
 * repeat: lines of text, a round avatar, a pill and a card.
 *
 * `delay` (seconds) offsets the sweep so a row of blocks ripples instead of flashing together.
 */
export function Skeleton({ className, delay = 0, style }: { className?: string; delay?: number; style?: React.CSSProperties }) {
  return <div aria-hidden className={cn("skeleton rounded-control", className)} style={{ ...(delay ? { ["--skeleton-delay" as string]: `${delay}s` } : null), ...style }} />;
}

/** Lines of text: full-width lines with a shorter last one, like a paragraph. */
export function SkeletonText({ lines = 3, className, lineClassName }: { lines?: number; className?: string; lineClassName?: string }) {
  return (
    <div aria-hidden className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} delay={i * 0.08} className={cn("h-3.5 rounded-full", i === lines - 1 && lines > 1 ? "w-3/5" : "w-full", lineClassName)} />
      ))}
    </div>
  );
}

/** A round picture: an avatar or an icon badge. */
export function SkeletonAvatar({ size = 40, className }: { size?: number; className?: string }) {
  return <Skeleton className={cn("shrink-0 rounded-full", className)} style={{ width: size, height: size }} />;
}

/** A pill or chip: a status label, a tab, a filter. */
export function SkeletonPill({ className }: { className?: string }) {
  return <Skeleton className={cn("h-8 w-24 rounded-full", className)} />;
}

/** A card-shaped surface that holds other skeleton pieces, so a screen reads as the same boxes it will become. */
export function SkeletonCard({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div aria-hidden className={cn("lgx-card rounded-card shadow-raised-mid p-4", className)}>
      {children}
    </div>
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
