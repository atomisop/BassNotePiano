"use client";

import { useEffect, useState } from "react";
import { CLASS_MINUTES } from "@/lib/classCreditPricing";
import type { ReservableSlot } from "@/lib/classSchedule";
import { buttonVariants } from "@/components/ui/button";
import { getWaitlistAction, setWaitlistAction } from "./actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function timeRange(startHHmm: string, minutes: number): string {
  const fmt = (total: number) => {
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  };
  const [h, m] = startHHmm.split(":").map(Number);
  return `${fmt(h * 60 + m)} to ${fmt(h * 60 + m + minutes)}`;
}

/** "Your time is taken? Get told when it opens." Lists the weekly times other plans hold; the first person in line is told when one frees up. */
export function SlotWaitlistPanel() {
  const [data, setData] = useState<{ taken: ReservableSlot[]; mine: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getWaitlistAction().then((d) => alive && setData(d)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(slot: ReservableSlot, join: boolean) {
    const key = `${slot.scheduleId}:${slot.chunkIndex}`;
    setBusy(key);
    setError(null);
    const result = await setWaitlistAction(slot.scheduleId, slot.chunkIndex, join);
    if (!result.ok) setError(result.error);
    else setData((d) => (d ? { ...d, mine: join ? [...d.mine, key] : d.mine.filter((k) => k !== key) } : d));
    setBusy(null);
  }

  if (!data || data.taken.length === 0) return null;
  return (
    <details className="mt-4 rounded-lg bg-neu-base px-3.5 py-3 shadow-raised-low">
      <summary className="cursor-pointer text-small font-medium text-slate-200">Want a time that is taken? Get told when it opens</summary>
      <p className="mt-2 text-small text-slate-400">These weekly times belong to other students right now. Add the ones you would like and we will message you the moment one frees up. You can wait for up to 5.</p>
      <ul className="mt-3 divide-y divide-slate-50/10">
        {data.taken.map((slot) => {
          const key = `${slot.scheduleId}:${slot.chunkIndex}`;
          const waiting = data.mine.includes(key);
          return (
            <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-small text-slate-200">
                {DAYS[slot.dayOfWeek]}, {timeRange(slot.startTime, CLASS_MINUTES)}
              </span>
              <button type="button" disabled={busy === key} onClick={() => toggle(slot, !waiting)} className={buttonVariants({ variant: waiting ? "secondary" : "primary", size: "sm", className: waiting ? "" : "text-black" })}>
                {waiting ? "Stop waiting" : "Tell me"}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-small text-red-400" role="alert">{error}</p>}
    </details>
  );
}
