"use client";

import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip } from "recharts";

export interface MetricPoint {
  label: string;
  value: number;
}

/**
 * #9, KPI card with a data-driven sparkline.
 *
 * Recharts colours are set from `currentColor` on a wrapper rather than hex
 * literals, so the chart follows the active theme's accent like everything
 * else. Recharts can't read Tailwind classes, but it can inherit
 * `currentColor`, which is the seam that makes a themed chart possible.
 *
 * The headline figure is always plain text above the chart. If the chart
 * fails to render, no data, zero height, a container that hasn't measured
 * yet, the number the card exists to communicate is still there.
 */
export function MetricCard({
  label,
  value,
  hint,
  data = [],
  variant = "area",
  tone = "accent",
}: {
  label: string;
  value: string | number;
  hint?: string;
  data?: MetricPoint[];
  variant?: "area" | "bar";
  tone?: "accent" | "success";
}) {
  const colorClass = "text-signal-fg";
  const hasSeries = data.length > 1;

  return (
    <div className="glass-surface p-5">
      <p className="text-small font-medium uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1.5 text-body tabular-nums text-slate-50 font-semibold">{value}</p>
      {hint && <p className="mt-1 text-small text-slate-500">{hint}</p>}

      {hasSeries && (
        <div className={`mt-4 h-14 w-full ${colorClass}`} aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            {variant === "bar" ? (
              <BarChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <Tooltip content={<SparkTooltip />} cursor={false} />
                <Bar dataKey="value" fill="currentColor" radius={[2, 2, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`spark-${label.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip content={<SparkTooltip />} cursor={false} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="currentColor"
                  strokeWidth={2}
                  fill={`url(#spark-${label.replace(/\W/g, "")})`}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* The series as text for assistive tech, since the chart above is
          aria-hidden and a sparkline conveys nothing to a screen reader. */}
      {hasSeries && (
        <span className="sr-only">
          {label} over time: {data.map((d) => `${d.label}, ${d.value}`).join("; ")}
        </span>
      )}
    </div>
  );
}

function SparkTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: MetricPoint }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md px-2 py-1 text-small text-slate-200 shadow-raised-mid">
      <span className="text-slate-500">{point.label ?? label}: </span>
      <span className="tabular-nums">{point.value}</span>
    </div>
  );
}
