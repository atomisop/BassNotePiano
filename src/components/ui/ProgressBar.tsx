import { cn } from "@/lib/utils";

/**
 * Progress is information, not an action, so the fill is ink and paper
 * (never signal green). The track is a pressed (inset) well; the fill sits
 * inside it.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  className,
}: {
  value: number;
  max?: number;
  label: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-neu-base p-0.5 shadow-pressed-low", className)}
    >
      <div
        className="h-full rounded-full bg-[rgb(var(--c-s-50))] transition-[width] duration-(--dur-base) ease-(--ease-ios) motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
