"use client";

// A number that rolls into place when `value` changes: each digit is a reel that slides to the new digit (see RollingNumber),
// so the eye sees the change instead of missing it. It used to tween through every number in between (a counter, adapted from
// 21st.dev danielpetho/basic-number-ticker); the callers are the same, only the look changed. `format` keeps prices their $ and
// cents. `duration` is kept so callers still compile, the reel's CSS transition sets its own time. Reduced motion is a CSS
// media query on the reel (it simply lands).
import { RollingNumber } from "@/components/ui/RollingNumber";

const defaultFormat = (n: number) => String(Math.round(n));

export function NumberTicker({
  value,
  format = defaultFormat,
  className,
  strike = false,
}: {
  value: number;
  format?: (n: number) => string;
  /** Ignored: the reel's transition sets its own time. */
  duration?: number;
  className?: string;
  /** Draw a line through it (an old price). */
  strike?: boolean;
}) {
  return <RollingNumber text={format(value)} className={className} strike={strike} />;
}
