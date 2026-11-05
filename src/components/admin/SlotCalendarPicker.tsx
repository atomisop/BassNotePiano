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
  /** Set on a time another student's weekly plan keeps: free of classes, but moving there needs the studio's confirmation. */
  heldBy?: string;
}

export interface BookedTime {
  id: string;
  scheduledAt: string;
  name: string;
}

const ET = "America/New_York";
const CLASS_MS = 45 * 60_000;
const etDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: ET });
const etMinutes = (iso: string) => {
  const [h, m] = new Date(iso).toLocaleTimeString("en-GB", { timeZone: ET, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
  return h * 60 + m;
};

/** How far back Reschedule reaches. */
const PAST_DAYS = 180;

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
 * (it only has to not overlap another class); without it only days with an open weekly time light up. `allowPast` (Reschedule) also
 * opens the last 180 days, every day of the week, so a class booked on the wrong day can be put on the day it really happened.
 */
export function SlotCalendarPicker({
  slots,
  booked,
  weekdays,
  allowAnyDay,
  day,
  onDay,
  picked,
  onPick,
  ownTime,
  onOwnTime,
  allowPast = false,
  held = [],
}: {
  slots: PickerSlot[];
  /** Classes already booked, shown on the chosen day so a custom time can be picked around them. */
  booked: BookedTime[];
  /** Weekdays the studio teaches (0 = Sunday). With `allowAnyDay`, only these days light up, so a class is never moved to a day you do not teach. */
  weekdays: number[];
  allowAnyDay: boolean;
  day: string | null;
  onDay: (key: string | null) => void;
  picked: PickerSlot | null;
  onPick: (slot: PickerSlot | null) => void;
  ownTime: string;
  onOwnTime: (time: string) => void;
  allowPast?: boolean;
  /** Times a plan keeps (Reschedule only): shown apart from the open ones. */
  held?: PickerSlot[];
}) {
  const occurrences = useMemo(() => {
    if (!allowAnyDay) return slots.map((s) => ({ occurrenceDateMs: s.occurrenceDateMs, isBooked: false }));
    const start = todayEtMs();
    const past = allowPast ? Array.from({ length: PAST_DAYS }, (_, i) => start - (PAST_DAYS - i) * 86_400_000) : [];
    const ahead = Array.from({ length: 366 }, (_, i) => start + i * 86_400_000).filter((ms) => weekdays.includes(new Date(ms).getUTCDay()));
    return [...past, ...ahead].map((ms) => ({ occurrenceDateMs: ms, isBooked: false }));
  }, [slots, allowAnyDay, allowPast, weekdays]);

  const dayBooked = useMemo(() => (day ? booked.filter((b) => etDay(b.scheduledAt) === day).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)) : []), [booked, day]);
  const clash = useMemo(() => {
    if (!day || !ownTime) return null;
    const [h, m] = ownTime.split(":").map(Number);
    const at = h * 60 + m;
    return dayBooked.find((b) => Math.abs(etMinutes(b.scheduledAt) - at) < 45) ?? null;
  }, [day, ownTime, dayBooked]);

  const daySlots = useMemo(() => (day ? slots.filter((s) => dayKey(s.occurrenceDateMs) === day) : []), [slots, day]);
  const dayHeld = useMemo(() => (day ? held.filter((s) => dayKey(s.occurrenceDateMs) === day) : []), [held, day]);

  return (
    <div>
      <BookingCalendar
        allowPast={allowPast}
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
          {dayHeld.length > 0 && (
            <div className={daySlots.length > 0 ? "mt-3" : ""}>
              <p className="mb-1.5 flex items-center gap-1 text-small font-medium text-slate-200">
                Kept by a plan
                <Hint label="About plan times">Free this week, but another student&apos;s weekly plan keeps this time. You can still move the class here; you will be asked first.</Hint>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {dayHeld.map((s) => {
                  const active = picked ? slotKey(picked) === slotKey(s) : false;
                  return (
                    <button
                      key={slotKey(s)}
                      type="button"
                      title={`${s.heldBy}'s plan`}
                      onClick={() => {
                        onPick(s);
                        onOwnTime("");
                      }}
                      className={`tap rounded-lg px-3 py-1.5 text-small font-medium transition ${active ? "bg-amber-300 text-slate-950" : "bg-amber-300/10 text-amber-200"}`}
                    >
                      {timeOf(s.scheduledAt)} · {(s.heldBy ?? "").split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {dayBooked.length > 0 && (
            <div className={daySlots.length > 0 || dayHeld.length > 0 ? "mt-3" : ""}>
              <p className="mb-1.5 text-small font-medium text-slate-200">Already booked</p>
              <div className="flex flex-wrap gap-1.5">
                {dayBooked.map((b) => (
                  <span key={b.id} className="rounded-lg bg-red-400/10 px-2.5 py-1 text-small text-red-300" title={b.name}>
                    {timeOf(b.scheduledAt)} to {timeOf(new Date(new Date(b.scheduledAt).getTime() + CLASS_MS).toISOString())} · {b.name.split(" ")[0]}
                  </span>
                ))}
              </div>
            </div>
          )}
          {allowAnyDay && daySlots.length === 0 && dayHeld.length === 0 && <p className="mb-2 text-small text-slate-500">No weekly times that day. Type a start time to create one.</p>}
          {allowAnyDay && (
            <div className={daySlots.length > 0 ? "mt-3" : ""}>
              <p className="mb-1.5 flex items-center gap-1 text-small font-medium text-slate-200">
                {daySlots.length > 0 ? "Or any start time" : "Start time (Eastern)"}
                <Hint label="About custom times">The class is 45 minutes and only has to not overlap another class. Back to back is fine.</Hint>
              </p>
              {clash && <p className="mb-1.5 text-small text-amber-300">That overlaps {clash.name.split(" ")[0]}&apos;s class at {timeOf(clash.scheduledAt)}.</p>}
              <input
                type="time"
                aria-label="Start time"
                value={ownTime}
                step={300}
                onChange={(e) => {
                  onOwnTime(e.target.value);
                  onPick(null);
                }}
                className="w-40 rounded-lg bg-neu-base px-3 py-2 text-body text-slate-100 shadow-raised-low"
              />
            </div>
          )}
          {!allowAnyDay && daySlots.length === 0 && <p className="text-small text-slate-500">No open times that day.</p>}
        </div>
      )}
    </div>
  );
}
