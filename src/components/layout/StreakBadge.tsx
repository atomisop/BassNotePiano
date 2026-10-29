"use client";

import Link from "next/link";
import { Flame } from "lucide-react";
import { useMeStatus } from "@/components/layout/MeStatusProvider";

/**
 * The practice streak in the top bar, next to the credits: a flame and the number of days in a row. The flame is lit (orange, filled)
 * once today's 10 minutes are done and gray until then, so a glance says whether today still needs doing. Opens the streak screen.
 */
export function StreakBadge() {
  const status = useMeStatus();
  if (!status) return null;
  const { streak, practicedToday } = status;
  const label = `${streak} day streak${practicedToday ? ", practiced today" : ", not practiced today yet"}. Open your streak.`;
  return (
    <Link
      href="/streak"
      aria-label={label}
      className="inline-flex h-[30px] items-center gap-1 rounded-full bg-neu-base px-2.5 text-small font-semibold text-slate-100 shadow-raised-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
    >
      <Flame
        aria-hidden
        className={practicedToday ? "h-4 w-4 text-signal-fg" : "h-4 w-4 text-slate-400"}
        fill={practicedToday ? "currentColor" : "none"}
        strokeWidth={2.2}
      />
      <span className="tabular-nums">{streak}</span>
    </Link>
  );
}
