/**
 * Pure rules for the practice streak screen (no database): the longest run of practiced days, and the calendar grid of recent weeks.
 * A practiced day is a day the 10 minute finger practice was completed, keyed YYYY-MM-DD in Eastern time (see fingerPractice.ts).
 */

export const STREAK_GOALS = [3, 7, 14, 30, 60, 100, 365] as const;

function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday, for a YYYY-MM-DD key. */
function weekday(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The longest run of consecutive practiced days ever. */
export function longestStreak(days: Iterable<string>): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    run = prev && shiftDay(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

/** The next goal above the current streak, or null once every goal is passed. */
export function nextStreakGoal(current: number): number | null {
  return STREAK_GOALS.find((g) => g > current) ?? null;
}

export interface CalendarDay {
  day: string;
  practiced: boolean;
  isToday: boolean;
  /** After today: drawn empty, never as missed. */
  future: boolean;
}

/**
 * The last `weeks` weeks as columns of seven days (Sunday at the top), ending with the week that holds today, so the grid always reads
 * left to right like a calendar.
 */
export function streakCalendar(days: Iterable<string>, today: string, weeks: number): CalendarDay[][] {
  const practiced = new Set(days);
  const start = shiftDay(today, -weekday(today) - (weeks - 1) * 7);
  const columns: CalendarDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const day = shiftDay(start, w * 7 + d);
      column.push({ day, practiced: practiced.has(day), isToday: day === today, future: day > today });
    }
    columns.push(column);
  }
  return columns;
}

/** Practiced days within the calendar month of `today`. */
export function practicedThisMonth(days: Iterable<string>, today: string): number {
  const month = today.slice(0, 7);
  let count = 0;
  for (const day of new Set(days)) if (day.startsWith(month) && day <= today) count++;
  return count;
}
