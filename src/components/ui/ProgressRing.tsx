/**
 * #6, Circular progress.
 *
 * Pure SVG, no dependency. Two things make this the accessible version rather
 * than a decorative one:
 *
 *  - It carries real `role="progressbar"` semantics with min/max/now, so a
 *    screen reader announces "3 of 6" instead of skipping a bare graphic.
 *  - The figure is also rendered as text in the middle. Colour alone never
 *    carries the value, which is what makes it readable for anyone who can't
 *    separate the track from the arc.
 *
 * `strokeDasharray` on a circle is the standard trick: the dash length is the
 * filled arc and the gap is the remainder, so animating one number sweeps the
 * ring without any path maths.
 */
export function ProgressRing({
  value,
  max = 100,
  size = 72,
  strokeWidth = 6,
  label,
  caption,
  tone = "accent",
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  /** Accessible name, e.g. "Scales completed". */
  label: string;
  /** Optional text under the figure. */
  caption?: string;
  tone?: "accent" | "success";
}) {
  const safeMax = max <= 0 ? 1 : max;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const fraction = clamped / safeMax;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * fraction;

  const arcClass = tone === "success" ? "text-slate-50" : "text-[rgb(var(--c-s-50))]";

  return (
    <div className="inline-flex flex-col items-center">
      <div
        className="relative"
        style={{ width: size, height: size }}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={label}
      >
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="text-ink/15"
            stroke="currentColor"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
            className={`${arcClass} transition-[stroke-dasharray] duration-700 ease-out`}
            stroke="currentColor"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-body tabular-nums text-slate-50">
          {Math.round(fraction * 100)}%
        </span>
      </div>
      {caption && (
        <span className="mt-2 text-small uppercase tracking-[0.14em] text-slate-400">
          {caption}
        </span>
      )}
    </div>
  );
}
