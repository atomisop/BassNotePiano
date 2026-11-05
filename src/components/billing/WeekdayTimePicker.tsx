"use client";

import { useMemo, useState } from "react";
import { Bell, Lock } from "@/components/ui/appIcons";
import type { ReservableSlot } from "@/lib/classSchedule";
import { DAY_NAMES, DAY_ORDER, DAY_SHORT, formatTimeLabel } from "@/lib/weeklyTimeLabels";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const chip = "tap rounded-control bg-neu-base text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const chipState = (active: boolean) => (active ? "shadow-pressed-low" : "shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low");
const keyOf = (s: ReservableSlot) => `${s.scheduleId}:${s.chunkIndex}`;
// Defaults that stay the same object between renders (a fresh [] each time would redo the grouping below on every render).
const NO_SLOTS: ReservableSlot[] = [];
const NO_KEYS: string[] = [];

/**
 * Pick a weekly class time in two taps with nothing to scroll past: a row of the days that have a time, then that day's times right
 * under it. What you are really choosing is "every <weekday> at <time>", so there is no calendar of dates to wade through.
 *
 * Times other students hold show in the same row, dimmed with a lock. Tap one and it offers "Tell me when it opens" right there
 * (a bell once you are waiting), so waiting for a time lives where you are choosing one, not in a section further down.
 */
export function WeekdayTimePicker({
  slots,
  selected,
  onSelect,
  taken = NO_SLOTS,
  waiting = NO_KEYS,
  busyKey = null,
  onWait,
  waitError = null,
}: {
  slots: ReservableSlot[];
  selected: ReservableSlot | null;
  onSelect: (slot: ReservableSlot | null) => void;
  /** Times another plan holds right now. */
  taken?: ReservableSlot[];
  /** Keys ("scheduleId:chunkIndex") of the taken times this person is waiting for. */
  waiting?: string[];
  /** The key of the waitlist request in flight, so its button can show it. */
  busyKey?: string | null;
  onWait?: (slot: ReservableSlot, join: boolean) => void;
  waitError?: string | null;
}) {
  const canWait = Boolean(onWait);
  const heldSlots = canWait ? taken : NO_SLOTS;
  const byDay = useMemo(() => {
    const map = new Map<number, { open: ReservableSlot[]; held: ReservableSlot[] }>();
    const entry = (d: number) => map.get(d) ?? map.set(d, { open: [], held: [] }).get(d)!;
    for (const s of slots) entry(s.dayOfWeek).open.push(s);
    for (const s of heldSlots) entry(s.dayOfWeek).held.push(s);
    return map;
  }, [slots, heldSlots]);
  const days = DAY_ORDER.filter((d) => byDay.has(d));
  const [pickedDay, setPickedDay] = useState<number | null>(null);
  const [looking, setLooking] = useState<ReservableSlot | null>(null);
  // With one day on offer there is nothing to choose: its times show straight away.
  const day = selected?.dayOfWeek ?? looking?.dayOfWeek ?? pickedDay ?? (days.length === 1 ? days[0] : null);
  const group = day === null ? null : byDay.get(day)!;
  const times = group
    ? [...group.open.map((slot) => ({ slot, held: false })), ...group.held.map((slot) => ({ slot, held: true }))].sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime))
    : [];
  const lookingKey = looking ? keyOf(looking) : null;
  const lookingWaiting = lookingKey ? waiting.includes(lookingKey) : false;
  const lookingBusy = lookingKey !== null && busyKey === lookingKey;
  const myWaits = heldSlots.filter((s) => waiting.includes(keyOf(s)));

  return (
    <div>
      <div role="group" aria-label="Day of the week" className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {days.map((d) => {
          const active = day === d;
          const open = byDay.get(d)!.open.length;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={active}
              aria-label={`${DAY_NAMES[d]}, ${open} ${open === 1 ? "time" : "times"} open`}
              onClick={() => {
                if (day === d) return;
                setPickedDay(d);
                setLooking(null);
                if (selected && selected.dayOfWeek !== d) onSelect(null);
              }}
              className={cn(chip, "flex min-h-14 flex-col items-center justify-center px-1 py-2", chipState(active))}
            >
              <span className={cn("text-small font-semibold", active ? "text-signal-fg" : "text-slate-100")}>{DAY_SHORT[d]}</span>
              <span className="text-small text-slate-500">{open > 0 ? open : "full"}</span>
            </button>
          );
        })}
      </div>

      {day === null ? null : (
        <div role="group" aria-label={`${DAY_NAMES[day]} times`} className="mt-3 grid grid-cols-3 gap-2">
          {times.map(({ slot, held }) => {
            const key = keyOf(slot);
            if (held) {
              const isWaiting = waiting.includes(key);
              const active = lookingKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${formatTimeLabel(slot.startTime)}, taken by another student${isWaiting ? ", you are waiting for it" : ""}`}
                  onClick={() => {
                    setLooking(slot);
                    onSelect(null);
                  }}
                  className={cn(chip, "flex min-h-11 items-center justify-center gap-1.5 px-1 py-2 text-small font-semibold", chipState(active), isWaiting ? "text-signal-fg" : "text-slate-500")}
                >
                  {isWaiting ? <Bell aria-hidden className="h-3.5 w-3.5 shrink-0" fill="currentColor" /> : <Lock aria-hidden className="h-3.5 w-3.5 shrink-0" />}
                  <span className={isWaiting ? "" : "line-through decoration-slate-600"}>{formatTimeLabel(slot.startTime)}</span>
                </button>
              );
            }
            const active = selected?.scheduleId === slot.scheduleId && selected.chunkIndex === slot.chunkIndex;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setLooking(null);
                  onSelect(slot);
                }}
                className={cn(chip, "flex min-h-11 items-center justify-center px-1 py-2 text-small font-semibold", chipState(active), active ? "text-signal-fg" : "text-slate-100")}
              >
                {formatTimeLabel(slot.startTime)}
              </button>
            );
          })}
        </div>
      )}

      {looking && onWait && !lookingWaiting && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-neu-base p-3 shadow-pressed-low" role="status">
          <span className="flex min-w-0 items-center gap-2 text-small font-semibold text-slate-100">
            <Lock aria-hidden className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="truncate">
              {DAY_SHORT[looking.dayOfWeek]} {formatTimeLabel(looking.startTime)}
            </span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-small font-medium text-slate-400">Taken</span>
          </span>
          <WaitButton waiting={false} busy={lookingBusy} onPress={() => onWait(looking, true)} compact />
        </div>
      )}

      {waitError && (
        <p className="mt-2 text-small text-red-400" role="alert">
          {waitError}
        </p>
      )}

      {myWaits.length > 0 && onWait && (
        <div className="mt-3">
          <ul aria-label="Times you are waiting for" className="space-y-1.5">
            {myWaits.map((slot) => (
              <li key={keyOf(slot)} className="flex items-center justify-between gap-3 rounded-control bg-neu-base px-3 py-2 shadow-pressed-low">
                <span className="flex min-w-0 items-center gap-2 text-small text-slate-200">
                  <Bell aria-hidden className="h-3.5 w-3.5 shrink-0 text-signal-fg" fill="currentColor" />
                  <span className="truncate">
                    {DAY_SHORT[slot.dayOfWeek]} {formatTimeLabel(slot.startTime)}
                  </span>
                </span>
                <WaitButton waiting busy={busyKey === keyOf(slot)} onPress={() => onWait(slot, false)} compact />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * "Tell me when it opens" / "Stop waiting". While the request runs it keeps its colour and shows the square loader, so it is clear
 * something is happening (a greyed-out button reads as broken); further taps are ignored until it finishes.
 */
function WaitButton({ waiting, busy, onPress, compact = false }: { waiting: boolean; busy: boolean; onPress: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      aria-busy={busy}
      onClick={() => {
        if (!busy) onPress();
      }}
      className={buttonVariants({ variant: "secondary", size: "sm", className: cn(compact ? "shrink-0" : "mt-3", busy && "cursor-progress") })}
    >
      {busy && <MorphingSquare size={14} className="mr-2 shrink-0" />}
      {waiting ? (busy ? "Stopping…" : "Stop waiting") : busy ? "Adding you…" : "Tell me when it opens"}
    </button>
  );
}
