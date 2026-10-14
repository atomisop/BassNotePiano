import { DAILY_GOAL_SECONDS } from "@/lib/fingerPracticeConstants";

// Pure rules for showing a student's daily finger practice to the teacher.
// Days are YYYY-MM-DD in America/New_York, the same keys FingerPracticeDay uses.

export interface PracticeDayRow {
  day: string;
  seconds: number;
  completedAt: Date | null;
}

export type PracticeDayState = "done" | "partial" | "missed";

export interface PracticeStripDay {
  day: string;
  seconds: number;
  state: PracticeDayState;
}

export function previousDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** The last `count` day keys, oldest first, ending with `today`. */
export function recentDayKeys(today: string, count: number): string[] {
  const keys: string[] = [];
  let cursor = today;
  for (let i = 0; i < count; i++) {
    keys.push(cursor);
    cursor = previousDayKey(cursor);
  }
  return keys.reverse();
}

export function dayState(row: PracticeDayRow | undefined): PracticeDayState {
  if (!row) return "missed";
  if (row.completedAt || row.seconds >= DAILY_GOAL_SECONDS) return "done";
  return row.seconds > 0 ? "partial" : "missed";
}

/** One entry per day for the last `count` days, oldest first. Days with no row are "missed". */
export function buildPracticeStrip(rows: PracticeDayRow[], today: string, count = 30): PracticeStripDay[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return recentDayKeys(today, count).map((day) => {
    const row = byDay.get(day);
    return { day, seconds: Math.min(row?.seconds ?? 0, DAILY_GOAL_SECONDS), state: dayState(row) };
  });
}

/** How many of the last 7 days (today included) had the full 10 minutes. */
export function doneInLast7(strip: PracticeStripDay[]): number {
  return strip.slice(-7).filter((d) => d.state === "done").length;
}

/** Minutes practiced over the last 7 days, rounded down. */
export function minutesInLast7(strip: PracticeStripDay[]): number {
  return Math.floor(strip.slice(-7).reduce((sum, d) => sum + d.seconds, 0) / 60);
}
