"use client";

import { useMemo, useState } from "react";

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
    const map = new Map<string, { count: number; hasOpenSlot: boolean; ms: number }>();
    for (const o of occurrences) {
      const key = dayKey(o.occurrenceDateMs);
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.hasOpenSlot = existing.hasOpenSlot || !o.isBooked;
      } else {
        map.set(key, { count: 1, hasOpenSlot: !o.isBooked, ms: o.occurrenceDateMs });
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

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="glass-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-body text-slate-100 font-semibold">{monthLabel}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            disabled={atMinMonth}
            aria-label="Previous month"
            className="tap flex h-7 w-7 items-center justify-center transition disabled:pointer-events-none disabled:opacity-30 neu-btn rounded-lg"
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
            className="tap flex h-7 w-7 items-center justify-center transition disabled:pointer-events-none disabled:opacity-30 neu-btn rounded-lg"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-y-1.5 text-center">
        {DAY_NAMES.map((d, i) => (
          <span key={i} className="text-small font-medium uppercase tracking-wide text-slate-600">
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
          const clickable = !!info && !isPast;

          return (
            <button
              key={key}
              type="button"
              disabled={!clickable}
              onClick={() => onSelectDate(isSelected ? null : key)}
              title={info ? `${info.count} class${info.count === 1 ? "" : "es"}` : undefined}
              className={`relative mx-auto flex h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-full flex-col items-center justify-center rounded-full text-small transition ${
                isSelected
                  ? "bg-amber-400 font-semibold text-slate-950"
                  : clickable
                    ? info?.hasOpenSlot
                      ? "font-medium text-[rgb(var(--c-s-50))] hover:bg-[rgb(var(--c-s-50)/0.15)]"
                      : "font-medium text-slate-500 hover:bg-ink/5"
                    : isToday
                      ? "text-slate-300 ring-1 ring-inset ring-ink/15"
                      : "text-slate-700"
              }`}
            >
              {day}
              {info && !isSelected && (
                <span
                  className={`absolute bottom-1 h-1 w-1 rounded-full ${info.hasOpenSlot ? "bg-[rgb(var(--c-s-50))]" : "bg-slate-600"}`}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-3">
        <p className="flex items-center gap-1.5 text-small text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--c-s-50))]" aria-hidden />
          Available
          <span className="ml-2 h-1.5 w-1.5 rounded-full bg-slate-600" aria-hidden />
          Booked
        </p>
        {selectedDateKey && (
          <button
            type="button"
            onClick={() => onSelectDate(null)}
            className="tap neu-btn rounded-lg px-3 py-1.5 text-small"
          >
            Show all
          </button>
        )}
      </div>
    </div>
  );
}
