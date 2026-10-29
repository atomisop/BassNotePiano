"use client";

import { useEffect, useMemo, useState } from "react";
import { buttonVariants } from "@/components/ui/button";

/**
 * Adapted from a 21st.dev/shadcnblocks "cal.com-style" bento calendar demo,
 * not a literal port. The original was a marketing teaser: a static month
 * grid where roughly 30% of days lit up via `Math.random() < 0.3` and the
 * card linked out to an external cal.com booking page. Neither of those
 * fits an actual booking flow, a random day isn't meaningfully "available",
 * and this app already has its own real booking system (see
 * ClassBookingClient, which books against live slot availability and a credit
 * balance, not a third-party calendar).
 *
 * What carried over is the genuinely useful part: a compact month-grid view
 * as a quick way to see *which* days have classes, instead of only a
 * scrolling this-week/next-week list. Every highlighted day here comes
 * straight from `occurrences`, the same data the list below it renders,
 * so the two can never disagree. Clicking a lit day filters that list down
 * to just that date; the list is still the thing that actually books.
 */

const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];

interface OccurrenceLike {
  occurrenceDateMs: number;
  isBooked: boolean;
}

/**
 * UTC-midnight day key, matching how occurrenceDateMs itself represents a
 * calendar day (see classSchedule.ts). Exported so ClassBookingClient can
 * filter its own `rows` by the exact same key this component selects with.
 */
export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function utcMidnight(year: number, monthIndex: number, day: number): number {
  return Date.UTC(year, monthIndex, day);
}

export function BookingCalendar({
  occurrences,
  selectedDateKey,
  onSelectDate,
}: {
  occurrences: OccurrenceLike[];
  selectedDateKey: string | null;
  onSelectDate: (key: string | null) => void;
}) {
  // One entry per distinct calendar day that has at least one occurrence,
  // multiple schedules landing on the same day just add to the day's own
  // count rather than producing duplicate dots.
  const dayInfo = useMemo(() => {
    const map = new Map<string, { count: number; open: number; hasOpenSlot: boolean; ms: number }>();
    for (const o of occurrences) {
      const key = dayKey(o.occurrenceDateMs);
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.open += o.isBooked ? 0 : 1;
        existing.hasOpenSlot = existing.hasOpenSlot || !o.isBooked;
      } else {
        map.set(key, { count: 1, open: o.isBooked ? 0 : 1, hasOpenSlot: !o.isBooked, ms: o.occurrenceDateMs });
      }
    }
    return map;
  }, [occurrences]);

  const sortedDayKeys = useMemo(() => Array.from(dayInfo.keys()).sort(), [dayInfo]);
  const todayMidnight = useMemo(() => {
    const now = new Date();
    return utcMidnight(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }, []);

  // Defaults to the month of the first upcoming class rather than always
  // "today", if the next available class is in early next month, opening
  // on a mostly-empty current month is a worse first impression than just
  // starting where the classes actually are.
  const [viewMonth, setViewMonth] = useState<{ year: number; monthIndex: number }>(() => {
    const first = sortedDayKeys[0] ? new Date(sortedDayKeys[0]) : new Date(todayMidnight);
    return { year: first.getUTCFullYear(), monthIndex: first.getUTCMonth() };
  });

  // Follow the chosen day: tapping a time in the month list (or a day anywhere) moves this calendar to that day's month.
  useEffect(() => {
    if (!selectedDateKey) return;
    const d = new Date(selectedDateKey);
    setViewMonth((v) => (v.year === d.getUTCFullYear() && v.monthIndex === d.getUTCMonth() ? v : { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() }));
  }, [selectedDateKey]);

  const minMonth = sortedDayKeys.length > 0 ? new Date(sortedDayKeys[0]) : new Date(todayMidnight);
  const maxMonth = sortedDayKeys.length > 0 ? new Date(sortedDayKeys[sortedDayKeys.length - 1]) : new Date(todayMidnight);
  const atMinMonth = viewMonth.year === minMonth.getUTCFullYear() && viewMonth.monthIndex === minMonth.getUTCMonth();
  const atMaxMonth = viewMonth.year === maxMonth.getUTCFullYear() && viewMonth.monthIndex === maxMonth.getUTCMonth();

  function shiftMonth(delta: number) {
    setViewMonth((v) => {
      const d = new Date(Date.UTC(v.year, v.monthIndex + delta, 1));
      return { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() };
    });
  }

  const monthLabel = new Date(Date.UTC(viewMonth.year, viewMonth.monthIndex, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const firstOfMonth = utcMidnight(viewMonth.year, viewMonth.monthIndex, 1);
  const firstWeekday = new Date(firstOfMonth).getUTCDay();
  const daysInMonth = new Date(Date.UTC(viewMonth.year, viewMonth.monthIndex + 1, 0)).getUTCDate();

  const allCells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // A week that is entirely behind us is no use to anyone: it is left out, so the first row is this week.
  const cells: (number | null)[] = [];
  for (let i = 0; i < allCells.length; i += 7) {
    const week = allCells.slice(i, i + 7);
    const allPast = week.every((d) => d === null || utcMidnight(viewMonth.year, viewMonth.monthIndex, d) < todayMidnight);
    if (!allPast) cells.push(...week);
  }

  return (
    <div className="glass-surface p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-body text-slate-100 font-semibold">{monthLabel}</p>
        <div className="flex items-center gap-1">
          {selectedDateKey && (
            <button type="button" onClick={() => onSelectDate(null)} className={buttonVariants({ variant: "secondary", size: "sm", className: "mr-1" })}>
              Show all
            </button>
          )}
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            disabled={atMinMonth}
            aria-label="Previous month"
            className={buttonVariants({ variant: "secondary", size: "iconSm" })}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            disabled={atMaxMonth}
            aria-label="Next month"
            className={buttonVariants({ variant: "secondary", size: "iconSm" })}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="no-wave mt-3 grid grid-cols-7 gap-y-1 text-center">
        {DAY_NAMES.map((d, i) => (
          <span key={i} className="text-small font-medium uppercase tracking-wide text-slate-500">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`blank-${i}`} />;
          const ms = utcMidnight(viewMonth.year, viewMonth.monthIndex, day);
          const key = dayKey(ms);
          const info = dayInfo.get(key);
          const isPast = ms < todayMidnight;
          const isToday = ms === todayMidnight;
          const isSelected = selectedDateKey === key;
          const clickable = !!info && !isPast && info.hasOpenSlot;
          const isFull = !!info && !isPast && !info.hasOpenSlot;

          return (
            <button
              key={key}
              type="button"
              disabled={!clickable}
              onClick={() => onSelectDate(isSelected ? null : key)}
              aria-label={info && !isPast ? `${day}, ${info.hasOpenSlot ? `${info.open} open` : "full"}` : undefined}
              title={info && !isPast ? (info.hasOpenSlot ? `${info.open} open` : "Full") : undefined}
              className={`relative mx-auto flex h-10 w-10 pointer-coarse:h-10 pointer-coarse:w-full flex-col items-center justify-center rounded-full text-small transition ${
                isSelected
                  ? "bg-signal font-semibold text-slate-950"
                  : clickable
                    ? "bg-[rgb(var(--signal)/0.14)] font-semibold text-slate-50 ring-1 ring-inset ring-[rgb(var(--signal)/0.45)] hover:bg-[rgb(var(--signal)/0.24)]"
                    : isFull
                      ? "text-slate-500 line-through decoration-slate-600/60"
                      : isToday
                        ? "text-slate-300 ring-1 ring-inset ring-ink/15"
                        : "text-slate-700"
              }`}
            >
              {day}
              {clickable && (
                <span className="absolute bottom-1 flex gap-0.5" aria-hidden>
                  {Array.from({ length: Math.min(info!.open, 3) }).map((_, n) => (
                    <span key={n} className={`h-1 w-1 rounded-full ${isSelected ? "bg-slate-950" : "bg-signal"}`} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

    </div>
  );
}
