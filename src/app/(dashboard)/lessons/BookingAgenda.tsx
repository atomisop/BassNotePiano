"use client";

import { viewerLocale, viewerZone } from "@/lib/viewerClock";
import { useMemo, useState } from "react";
import { Check } from "@/components/ui/appIcons";
import { dayKey } from "./BookingCalendar";
import { seatsLeftNote } from "@/lib/seatRules";

/**
 * The month as a list of days, like the reference's activity calendar: month tabs across the top, then one row per day with that
 * day's times as pills. It only shows and picks; every rule about what a tap does (a family class, moving a class, a weekly limit)
 * stays in ClassBookingClient, which decides in `onPick`. So a day with times can be chosen from here or from the small calendar,
 * and both end in the same state.
 */

export interface AgendaRow {
  /** `scheduleId:occurrenceDateMs:chunkIndex`, the same key the booking screen uses for a picked time. */
  key: string;
  occurrenceDateMs: number;
  scheduledAt: string;
  durationMin: number;
  isBooked: boolean;
  seats?: number;
  seatsLeft?: number;
  reservedForYou?: boolean;
}

const MONTH_SHORT = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString(viewerLocale(), { month: "short", timeZone: "UTC" });

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(viewerLocale(), { hour: "numeric", minute: "2-digit", timeZone: viewerZone() });
}

export function BookingAgenda({
  rows,
  selectedDateKey,
  pickedKeys,
  onPick,
}: {
  rows: AgendaRow[];
  selectedDateKey: string | null;
  pickedKeys: Set<string>;
  onPick: (key: string, day: string) => void;
}) {
  const todayMs = useMemo(() => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }, []);

  // The months that have any time at all, in order.
  const months = useMemo(() => {
    const seen = new Map<string, { year: number; monthIndex: number }>();
    for (const r of rows) {
      const d = new Date(r.occurrenceDateMs);
      const k = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      if (!seen.has(k)) seen.set(k, { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() });
    }
    return [...seen.values()].sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
  }, [rows]);

  const [chosenMonth, setChosenMonth] = useState<string | null>(null);
  const selectedMonth = selectedDateKey ? `${new Date(selectedDateKey).getUTCFullYear()}-${new Date(selectedDateKey).getUTCMonth()}` : null;
  const activeKey = chosenMonth ?? selectedMonth ?? (months[0] ? `${months[0].year}-${months[0].monthIndex}` : null);
  const active = months.find((m) => `${m.year}-${m.monthIndex}` === activeKey) ?? months[0];

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaRow[]>();
    for (const r of rows) {
      const k = dayKey(r.occurrenceDateMs);
      map.set(k, [...(map.get(k) ?? []), r].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
    }
    return map;
  }, [rows]);

  if (!active) return null;
  const daysInMonth = new Date(Date.UTC(active.year, active.monthIndex + 1, 0)).getUTCDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => Date.UTC(active.year, active.monthIndex, i + 1)).filter((ms) => ms >= todayMs - 86_400_000 * 0);

  return (
    <section aria-label="Classes by day" className="min-w-0">
      <div role="tablist" aria-label="Month" className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {months.map((m) => {
          const k = `${m.year}-${m.monthIndex}`;
          const on = k === `${active.year}-${active.monthIndex}`;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setChosenMonth(k)}
              className={`tap shrink-0 rounded-full px-4 py-1.5 text-small font-medium transition ${
                on ? "bg-neu-lift text-signal-fg shadow-raised-low" : "text-slate-400 hover:text-slate-100"
              }`}
            >
              {MONTH_SHORT(m.year, m.monthIndex)}
              {months.some((o) => o.monthIndex === m.monthIndex && o.year !== m.year) && ` ${m.year}`}
            </button>
          );
        })}
      </div>

      <ol className="lgx-card max-h-[34rem] divide-y divide-(--neu-edge) overflow-y-auto rounded-2xl">
        {days.map((ms) => {
          const key = dayKey(ms);
          const list = byDay.get(key) ?? [];
          const isToday = ms === todayMs;
          const weekday = new Date(ms).getUTCDay();
          const isSelected = selectedDateKey === key;
          return (
            <li key={key} className={`grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 px-3 py-3 ${isSelected ? "bg-slate-50/4" : ""}`}>
              <span className="flex flex-col items-center text-center">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-small font-semibold tabular-nums ${
                    isToday ? "bg-signal text-slate-950" : "text-slate-300"
                  }`}
                >
                  {new Date(ms).getUTCDate()}
                </span>
                <span className="text-caption uppercase tracking-wide text-slate-500">
                  {new Date(ms).toLocaleDateString(viewerLocale(), { weekday: "short", timeZone: "UTC" })}
                </span>
              </span>
              {list.length === 0 ? (
                <span className="text-small text-slate-500">{weekday === 0 || weekday === 6 ? "Weekend" : "No classes"}</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {list.map((r) => {
                    const picked = pickedKeys.has(r.key);
                    // The time is what you read; whether it is open is a quiet state, so only the exceptions get a word or a colour.
                    const tone = r.isBooked
                      ? "bg-transparent text-slate-500 ring-1 ring-inset ring-slate-50/8"
                      : picked
                        ? "lgx-btn text-slate-50"
                        : r.reservedForYou
                          ? "tint-peach"
                          : "lgx-btn text-slate-100";
                    const state = r.isBooked ? "Taken" : picked ? "Picked" : r.reservedForYou ? "Reserved for you" : null;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        disabled={r.isBooked}
                        aria-pressed={picked}
                        data-glass-tone={picked && !r.isBooked ? "primary" : undefined}
                        onClick={() => onPick(r.key, key)}
                        className={`tap flex min-h-9 items-center gap-1.5 rounded-control px-3 py-1.5 text-left transition disabled:cursor-not-allowed ${tone}`}
                      >
                        {picked && <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-signal-fg" strokeWidth={2.5} />}
                        <span className={`text-small font-semibold leading-tight tabular-nums ${r.isBooked ? "line-through decoration-slate-600" : ""}`}>{timeLabel(r.scheduledAt)}</span>
                        {state && <span className="text-caption leading-tight opacity-80">{state}</span>}
                        {!state && seatsLeftNote(r.seats ?? 1, r.seatsLeft) && <span className="text-caption leading-tight text-slate-500">{seatsLeftNote(r.seats ?? 1, r.seatsLeft)}</span>}
                        {!state && <span className="sr-only">Open, {r.durationMin} min</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
