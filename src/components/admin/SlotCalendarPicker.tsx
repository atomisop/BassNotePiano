"use client";

import { useMemo } from "react";
import { BookingCalendar, dayKey } from "@/app/(dashboard)/lessons/BookingCalendar";
import { Hint } from "@/components/ui/Hint";

export interface PickerSlot {
  scheduleId: string;
  occurrenceDateMs: number;
  chunkIndex: number;
  label: string | null;
  scheduledAt: string;
  creditCost: number;
}

const slotKey = (s: PickerSlot) => `${s.scheduleId}:${s.occurrenceDateMs}:${s.chunkIndex}`;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

/** Today's date in Eastern as UTC-midnight ms, the same stand-in the booking calendar uses for a calendar day. */
function todayEtMs(): number {
  const [y, m, d] = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * The booking calendar the students use, for the admin's Move and Book boxes: tap a day, then one of its open weekly times.
 * With `allowAnyDay` every day for the next year can be tapped and a start time typed in, so a class can go anywhere
 * (it only has to not overlap another class); without it only days with an open weekly time light up.
 */
export function SlotCalendarPicker({
  slots,
  allowAnyDay,
  day,
  onDay,
  picked,
  onPick,
  ownTime,
  onOwnTime,
}: {
  slots: PickerSlot[];
  allowAnyDay: boolean;
  day: string | null;
  onDay: (key: string | null) => void;
  picked: PickerSlot | null;
  onPick: (slot: PickerSlot | null) => void;
  ownTime: string;
  onOwnTime: (time: string) => void;
}) {
  const occurrences = useMemo(() => {
    if (!allowAnyDay) return slots.map((s) => ({ occurrenceDateMs: s.occurrenceDateMs, isBooked: false }));
    const start = todayEtMs();
    return Array.from({ length: 366 }, (_, i) => ({ occurrenceDateMs: start + i * 86_400_000, isBooked: false }));
  }, [slots, allowAnyDay]);

  const daySlots = useMemo(() => (day ? slots.filter((s) => dayKey(s.occurrenceDateMs) === day) : []), [slots, day]);

  return (
    <div>
      <BookingCalendar
        occurrences={occurrences}
        selectedDateKey={day}
        onSelectDate={(key) => {
          onDay(key);
          onPick(null);
          onOwnTime("");
        }}
      />
      {!day && <p className="mt-2 text-small text-slate-500">Tap a day.</p>}
      {day && (
        <div className="mt-3">
          {daySlots.length > 0 && (
            <>
              <p className="mb-1.5 text-small font-medium text-slate-200">Open times</p>
              <div className="flex flex-wrap gap-1.5">
                {daySlots.map((s) => {
                  const active = picked ? slotKey(picked) === slotKey(s) : false;
                  return (
                    <button
                      key={slotKey(s)}
                      type="button"
                      onClick={() => {
                        onPick(s);
                        onOwnTime("");
                      }}
                      className={`tap rounded-lg px-3 py-1.5 text-small font-medium transition ${active ? "bg-signal text-slate-950" : "bg-neu-base text-slate-100 shadow-raised-low"}`}
                    >
                      {timeOf(s.scheduledAt)}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {allowAnyDay && (
            <div className={daySlots.length > 0 ? "mt-3" : ""}>
              <p className="mb-1.5 flex items-center gap-1 text-small font-medium text-slate-200">
                {daySlots.length > 0 ? "Or any start time" : "Start time (Eastern)"}
                <Hint label="About custom times">The class is 45 minutes and only has to not overlap another class. Back to back is fine.</Hint>
              </p>
              <input
                type="time"
                aria-label="Start time"
                value={ownTime}
                step={300}
                onChange={(e) => {
                  onOwnTime(e.target.value);
                  onPick(null);
                }}
                className="w-40 rounded-lg bg-neu-base px-3 py-2 text-base text-slate-100 shadow-raised-low"
              />
            </div>
          )}
          {!allowAnyDay && daySlots.length === 0 && <p className="text-small text-slate-500">No open times that day.</p>}
        </div>
      )}
    </div>
  );
}
