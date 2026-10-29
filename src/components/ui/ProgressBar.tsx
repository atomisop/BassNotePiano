import { cn } from "@/lib/utils";

/**
 * Progress is information, not an action, so the fill is ink and paper
 * (never signal green). The track is a pressed (inset) well; the fill sits
 * inside it.
 */
/**
 * "about 30s left" / "about 2 min left". Rounded up and coarse on purpose: a
 * to-the-second countdown on a flaky connection just jitters.
 */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 5) return "almost done";
  if (seconds < 60) return `about ${Math.ceil(seconds / 5) * 5}s left`;
  return `about ${Math.ceil(seconds / 60)} min left`;
}

/**
 * A bar with no number is not progress, so the readout above the bar carries
 * the percent plus, when known, the step ("Step 2 of 4") and the time left.
 * `readout={false}` keeps the bare bar for places that already print the
 * number next to it.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  className,
  step,
  totalSteps,
  etaSeconds,
  readout = false,
}: {
  value: number;
  max?: number;
  label: string;
  className?: string;
  step?: number;
  totalSteps?: number;
  etaSeconds?: number;
  readout?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const parts = [
    step !== undefined && totalSteps !== undefined ? `Step ${step} of ${totalSteps}` : null,
    `${Math.round(pct)}%`,
    etaSeconds !== undefined ? formatEta(etaSeconds) : null,
  ].filter(Boolean);
  const bar = (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-neu-base p-0.5 shadow-pressed-low", !readout && className)}
    >
      <div
        className="h-full rounded-full bg-slate-50 transition-[width] duration-(--dur-base) ease-(--ease-ios) motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
  if (!readout) return bar;
  return (
    <div className={className}>
      <p className="mb-1.5 text-small tabular-nums text-slate-400">{parts.join(" · ")}</p>
      {bar}
    </div>
  );
}
