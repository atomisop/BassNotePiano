"use client";

import { useMemo, useState } from "react";
import type { ReservableSlot } from "@/lib/classSchedule";
import { CLASS_MINUTES } from "@/lib/classCreditPricing";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { SlideOverPanel } from "@/components/layout/SlideOverPanel";
import { BookingCalendar, dayKey } from "./BookingCalendar";
import { buttonVariants } from "@/components/ui/button";
import { Hint } from "@/components/ui/Hint";
import { seatsLeftNote } from "@/lib/seatRules";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Start time plus the class length, e.g. "6:00 PM to 6:45 PM". */
function formatTimeRange(startHHmm: string, minutes: number): string {
  const [h, m] = startHHmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${formatTimeLabel(startHHmm)} to ${formatTimeLabel(`${Math.floor(total / 60) % 24}:${String(total % 60).padStart(2, "0")}`)}`;
}

/** The next `weeks` calendar dates (UTC-midnight ms, the key BookingCalendar uses) that fall on `dayOfWeek`, starting today. */
function upcomingDatesFor(dayOfWeek: number, weeks: number): number[] {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const ahead = (dayOfWeek - now.getDay() + 7) % 7;
  return Array.from({ length: weeks }, (_, i) => today + (ahead + i * 7) * 86_400_000);
}

/**
 * Picks a new standing weekly time with the same calendar the booking page uses: tap a day, pick one of
 * its times, then confirm. What is really chosen is "every <weekday> at <time>"; the dates are just a
 * friendly way to point at it. The confirm step is there because this moves every future weekly class.
 */
export function WeeklyTimePicker({
  slots,
  busyKey,
  onConfirm,
  initialKey = null,
}: {
  slots: ReservableSlot[];
  /** `${scheduleId}:${chunkIndex}` of the slot being saved, or null. */
  busyKey: string | null;
  onConfirm: (slot: ReservableSlot) => void;
  /** `${scheduleId}:${chunkIndex}` to have chosen on arrival (a notice said this time opened), when it is still open. */
  initialKey?: string | null;
}) {
  const initial = initialKey ? slots.find((s) => `${s.scheduleId}:${s.chunkIndex}` === initialKey) ?? null : null;
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(() =>
    initial ? dayKey(upcomingDatesFor(initial.dayOfWeek, 1)[0]) : null,
  );
  const [timesOpen, setTimesOpen] = useState(false);
  const [selected, setSelected] = useState<ReservableSlot | null>(initial);

  const calendarRows = useMemo(
    () => slots.flatMap((slot) => upcomingDatesFor(slot.dayOfWeek, 6).map((ms) => ({ occurrenceDateMs: ms, isBooked: false, slot }))),
    [slots],
  );
  const daySlots = useMemo(() => {
    if (!selectedDateKey) return [];
    const weekday = new Date(`${selectedDateKey}T00:00:00Z`).getUTCDay();
    return slots.filter((s) => s.dayOfWeek === weekday).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [slots, selectedDateKey]);

  const busy = busyKey !== null;

  return (
    <div>
      <BookingCalendar
        occurrences={calendarRows}
        selectedDateKey={selectedDateKey}
        onSelectDate={(key) => {
          // Tapping the picked day again reopens its times instead of clearing it.
          if (key === null && selectedDateKey) {
            setTimesOpen(true);
            return;
          }
          setSelectedDateKey(key);
          setSelected(null);
          if (key) setTimesOpen(true);
        }}
      />
      {!selected && <p className="mt-3 text-small text-slate-500"><Hint>Pick a day, then a time.</Hint></p>}

      <SlideOverPanel
        open={timesOpen && !!selectedDateKey}
        onClose={() => setTimesOpen(false)}
        title={
          selectedDateKey
            ? new Date(`${selectedDateKey}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })
            : "Pick a time"
        }
      >
        <div className="grid grid-cols-2 gap-3 p-4">
          {daySlots.map((slot) => {
            const active = selected?.scheduleId === slot.scheduleId && selected?.chunkIndex === slot.chunkIndex;
            return (
              <button
                key={`${slot.scheduleId}:${slot.chunkIndex}`}
                type="button"
                onClick={() => {
                  setSelected(slot);
                  setTimesOpen(false);
                }}
                aria-pressed={active}
                className={`tap flex min-h-20 flex-col items-center justify-center gap-1 rounded-control px-3 py-3 text-center transition bg-neu-base ${
                  active ? "shadow-pressed-low" : "shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                }`}
              >
                <span className={`text-body font-semibold ${active ? "text-signal-fg" : "text-slate-100"}`}>{formatTimeRange(slot.startTime, CLASS_MINUTES)}</span>
                <span className="text-small text-slate-500">{active ? "Selected" : slot.label ?? `${CLASS_MINUTES} min`}</span>
                {seatsLeftNote(slot.seats, slot.seatsLeft) && <span className="text-caption text-slate-500">{seatsLeftNote(slot.seats, slot.seatsLeft)}</span>}
              </button>
            );
          })}
        </div>
      </SlideOverPanel>

      {selected && (
        <div className="mt-3 rounded-xl bg-neu-base px-3.5 py-3 shadow-pressed-low">
          <p className="text-small text-slate-300">
            Move your weekly class to every <span className="font-semibold text-slate-50">{DAY_LABELS[selected.dayOfWeek]}</span>,{" "}
            <span className="font-semibold text-slate-50">{formatTimeRange(selected.startTime, CLASS_MINUTES)} ET</span>?
          </p>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            disabled={busy}
            className={buttonVariants({ variant: "primary", className: "mt-2.5" })}
          >
            {busy && <MorphingSquare size={13} className="shrink-0" />}
            {busy ? "Moving…" : "Confirm new time"}
          </button>
        </div>
      )}
    </div>
  );
}
