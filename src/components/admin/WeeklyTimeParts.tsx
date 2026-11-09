"use client";

import { useState } from "react";
import { ArrowRight, CalendarPlus } from "@/components/ui/appIcons";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import { moveClashClassAction } from "@/app/(dashboard)/admin/schedule/weeklyTimeActions";
import { DAY_NAMES, weekdayDay, shortDay, namesList, type TypedWeeklyTime } from "@/lib/weeklyTimeRules";

/**
 * Pieces shared by the owner's weekly time choices (Set up plan, Weekly time, the plan builder, a contact's holds): "Another time…" to type
 * a day and start time that has no window yet, and moving the one class that stands in a time's way, right where the choice is made.
 */

/** The value of the last option in a weekly time list: type a day and start time instead. */
export const ANOTHER_TIME = "__another";

export const fieldClass = "min-h-11 w-full min-w-0 rounded-xl bg-neu-base px-3.5 py-2 text-body text-slate-100 shadow-pressed-low";

/** Monday first, the way people think of a school week. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const etClock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const etHHmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/**
 * "Another time…": a day and a start time. `onUse` checks it on the server (it may already be one of a window's classes, run into one, or
 * be new); the caller shows the answer as a choice. A class is always 45 minutes.
 */
export function AnotherTimeFields({ onUse, busy, hint = "A new 45 minute weekly time is made for it, unless that time is already a class." }: { onUse: (time: TypedWeeklyTime) => void; busy: boolean; hint?: string }) {
  const [day, setDay] = useState(1);
  const [start, setStart] = useState("16:00");
  return (
    <div className="mt-1.5 grid gap-2 rounded-xl bg-neu-base p-3 shadow-pressed-low">
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-caption text-slate-400">Day</span>
          <select value={day} onChange={(e) => setDay(Number(e.target.value))} className={fieldClass}>
            {DAY_ORDER.map((d) => (
              <option key={d} value={d}>
                {DAY_NAMES[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-caption text-slate-400">Starts at</span>
          <input type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} className={fieldClass} />
        </label>
      </div>
      <p className="text-caption text-slate-400">{hint}</p>
      <div>
        <Button type="button" size="sm" variant="secondary" loading={busy} disabled={busy || !start} onClick={() => onUse({ dayOfWeek: day, startTime: start })}>
          <CalendarPlus aria-hidden className="mr-1.5 h-3.5 w-3.5" />
          Use this time
        </Button>
      </div>
    </div>
  );
}

export interface ClashRow {
  bookingId: string;
  firstName: string;
  name: string;
  /** Eastern date, YYYY-MM-DD. */
  date: string;
  /** Start (ISO). */
  at: string;
}

/**
 * One class that sits on a weekly time someone wants: who and when, and "Move Sam's Dec 2 class" to any day and start time, through the
 * studio's own Reschedule (it still may not run into another class). `onMoved` reloads the choices, so the time shows as free.
 */
export function ClashMover({ clash, notify, onMoved }: { clash: ClashRow; notify: boolean; onMoved: () => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(clash.date);
  const [time, setTime] = useState(etHHmm(clash.at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move() {
    setBusy(true);
    setError(null);
    const result = await moveClashClassAction(clash.bookingId, date, time, notify).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    toast.success(`${clash.firstName}'s class moved to ${shortDay(date)}`);
    setOpen(false);
    onMoved();
  }

  return (
    <li className="grid gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-small text-slate-200">
          {clash.name} has {weekdayDay(clash.date)} at {etClock(clash.at)}
        </span>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="tap inline-flex items-center gap-1 text-small font-medium text-signal-fg underline underline-offset-4">
            Move {clash.firstName}&apos;s {shortDay(clash.date)} class
          </button>
        )}
      </div>
      {open && (
        <div className="grid gap-2 rounded-xl bg-neu-base p-2.5 shadow-pressed-low">
          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-caption text-slate-400">New day</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
            </label>
            <label className="grid gap-1">
              <span className="text-caption text-slate-400">Starts at</span>
              <input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} />
            </label>
          </div>
          {error && (
            <p role="alert" className="text-small text-red-400">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" loading={busy} disabled={busy || !date || !time} onClick={() => void move()}>
              <ArrowRight aria-hidden className="mr-1.5 h-3.5 w-3.5" />
              Move the class
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Never mind
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** "Held for Jo", "2 waiting: Ann and Bo" and the like, shown under a chosen weekly time. Quiet gray lines; nothing here blocks. */
export function TimeFacts({ holds, waiting, isNew }: { holds: { contactName: string; mine: boolean }[]; waiting: string[]; isNew: boolean }) {
  const mine = holds.filter((h) => h.mine);
  const others = holds.filter((h) => !h.mine);
  if (!isNew && holds.length === 0 && waiting.length === 0) return null;
  return (
    <div className="mt-1.5 grid gap-0.5 text-small text-slate-400">
      {isNew && <p>A new weekly time. It is made when you save, and students see it as taken.</p>}
      {mine.length > 0 && <p>Kept for them on Contacts. Saving releases it.</p>}
      {others.length > 0 && <p className="text-amber-300">Held for {namesList(others.map((h) => h.contactName))} on Contacts.</p>}
      {waiting.length > 0 && (
        <p>
          {waiting.length} waiting for this time: {namesList(waiting)}.
        </p>
      )}
    </div>
  );
}

/** The suffix a weekly time carries in a list, so what is in its way shows before it is picked. */
export function choiceSuffix(c: { holds: { contactName: string; mine: boolean }[]; clashes: { firstName: string; date: string }[]; waiting: string[] }, clashText: (clashes: { firstName: string; date: string }[]) => string): string {
  const parts: string[] = [];
  const other = c.holds.find((h) => !h.mine);
  if (other) parts.push(`held for ${other.contactName}`);
  else if (c.holds.some((h) => h.mine)) parts.push("kept for them");
  if (c.clashes.length > 0) parts.push(clashText(c.clashes));
  if (c.waiting.length > 0) parts.push(`${c.waiting.length} waiting`);
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}
