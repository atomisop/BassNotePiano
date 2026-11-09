/**
 * Pure rules for weekly times that are made, cleared and moved where the owner already is: "Another time…" in Set up plan, Weekly time,
 * the plan builder and a contact's holds; clashes named instead of hidden; a weekly window moved with everyone on it; a closed day's
 * classes moved instead of canceled. No database here, so they are tested on their own (tests/weeklyTimeRules.test.ts).
 */
import { CLASS_MINUTES } from "@/lib/classCreditPricing";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A weekly time typed by the owner: a day (0 Sunday to 6 Saturday) and a start time, "HH:mm" Eastern. */
export interface TypedWeeklyTime {
  dayOfWeek: number;
  startTime: string;
}

/** "16:00" to minutes after midnight, or null when it is not a real clock time. */
export function minutesOfDay(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const hhmmOf = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** "16:00" to "4:00 PM". */
export function clockLabel(hhmm: string): string {
  const total = minutesOfDay(hhmm) ?? 0;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "Tuesday 4:00 PM to 4:45 PM". */
export function weeklyTimeLabel(dayOfWeek: number, startTime: string): string {
  const start = minutesOfDay(startTime) ?? 0;
  return `${DAY_NAMES[dayOfWeek]} ${clockLabel(startTime)} to ${clockLabel(hhmmOf((start + CLASS_MINUTES) % (24 * 60)))}`;
}

/**
 * Checks a typed weekly time: a real weekday, a real clock time on a 5 minute mark, and a class that ends by midnight. Gives the time
 * written the one way the schedule stores it ("09:30"), so the same time typed twice is the same time.
 */
export function parseWeeklyTime(input: { dayOfWeek: unknown; startTime: unknown }): { error: string } | TypedWeeklyTime {
  const day = Number(input.dayOfWeek);
  if (!Number.isInteger(day) || day < 0 || day > 6) return { error: "Pick a day." };
  const start = minutesOfDay(String(input.startTime ?? ""));
  if (start === null) return { error: "Type a start time, like 4:00 PM." };
  if (start % 5 !== 0) return { error: "Pick a start time on a 5 minute mark." };
  if (start + CLASS_MINUTES > 24 * 60) return { error: "A class has to end by midnight." };
  return { dayOfWeek: day, startTime: hhmmOf(start) };
}

/** A weekly window as these rules need it: its day, its start, and where each of its classes starts (minutes after the window's start). */
export interface WindowShape {
  id: string;
  dayOfWeek: number;
  startTime: string;
  chunkOffsets: number[];
}

export type WeeklyTimeFit =
  /** The typed time is already one of a window's classes. */
  | { kind: "existing"; scheduleId: string; chunkIndex: number }
  /** It would run into one of a window's classes. */
  | { kind: "overlap"; scheduleId: string; classStart: string }
  /** Nothing is there yet: a new 45 minute window is made for it. */
  | { kind: "new" };

/**
 * Where a typed time lands among the windows that are offered: on an existing class (use it), across one (refused, so two weekly classes
 * never overlap), or on open time (a new window). `ignoreIds` leaves out windows that are about to be retired (moving a window).
 */
export function fitWeeklyTime(windows: WindowShape[], time: TypedWeeklyTime, ignoreIds: string[] = []): WeeklyTimeFit {
  const start = minutesOfDay(time.startTime);
  if (start === null) return { kind: "new" };
  for (const w of windows) {
    if (w.dayOfWeek !== time.dayOfWeek || ignoreIds.includes(w.id)) continue;
    const base = minutesOfDay(w.startTime) ?? 0;
    const index = w.chunkOffsets.findIndex((offset) => base + offset === start);
    if (index >= 0) return { kind: "existing", scheduleId: w.id, chunkIndex: index };
  }
  for (const w of windows) {
    if (w.dayOfWeek !== time.dayOfWeek || ignoreIds.includes(w.id)) continue;
    const base = minutesOfDay(w.startTime) ?? 0;
    const hit = w.chunkOffsets.find((offset) => Math.abs(base + offset - start) < CLASS_MINUTES);
    if (hit !== undefined) return { kind: "overlap", scheduleId: w.id, classStart: hhmmOf(base + hit) };
  }
  return { kind: "new" };
}

/** Why a typed time cannot be used, said plainly, or null when it can. */
export function fitRefusal(fit: WeeklyTimeFit, dayOfWeek: number): string | null {
  if (fit.kind !== "overlap") return null;
  return `That runs into the ${clockLabel(fit.classStart)} class on ${DAY_NAMES[dayOfWeek]}s. Pick ${clockLabel(fit.classStart)} itself, or a time that does not touch it.`;
}

/** "Sam" from "Sam Lee", or the part of an email before the @. */
export function firstNameOf(name: string | null, email: string): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || email.split("@")[0];
}

/** "Dec 2" for a calendar date written YYYY-MM-DD. */
export function shortDay(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Tue, Dec 2". */
export function weekdayDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${DAY_SHORT[d.getUTCDay()]}, ${shortDay(ymd)}`;
}

/** One person's class that sits on a weekly time someone else wants. */
export interface ClashLike {
  firstName: string;
  /** The class's Eastern date, YYYY-MM-DD. */
  date: string;
}

/** "Sam has Dec 2", "Sam has Dec 2 and Dec 9", "Sam has Dec 2, Ann has Dec 9", "Sam has Dec 2 and 3 more". */
export function clashSummary(clashes: ClashLike[]): string {
  if (clashes.length === 0) return "";
  const sorted = [...clashes].sort((a, b) => a.date.localeCompare(b.date));
  const byPerson = new Map<string, string[]>();
  for (const c of sorted) byPerson.set(c.firstName, [...(byPerson.get(c.firstName) ?? []), c.date]);
  if (byPerson.size === 1) {
    const [[name, dates]] = [...byPerson.entries()];
    if (dates.length === 1) return `${name} has ${shortDay(dates[0])}`;
    if (dates.length === 2) return `${name} has ${shortDay(dates[0])} and ${shortDay(dates[1])}`;
    return `${name} has ${shortDay(dates[0])} and ${dates.length - 1} more`;
  }
  const first = sorted[0];
  const second = sorted.find((c) => c.firstName !== first.firstName)!;
  const rest = sorted.length - 2;
  return `${first.firstName} has ${shortDay(first.date)}, ${second.firstName} has ${shortDay(second.date)}${rest > 0 ? ` and ${rest} more` : ""}`;
}

/** The first date in `dates` after every clash, so a plan can start once the weekly time is clear. Null when none of them is. */
export function firstClearDate(dates: string[], clashDates: string[]): string | null {
  if (clashDates.length === 0) return dates[0] ?? null;
  const last = clashDates.reduce((a, b) => (a > b ? a : b));
  return dates.find((d) => d > last) ?? null;
}

/** The clashes a plan starting on `firstClassYmd` would run into: those on that day or later. */
export function clashesFrom<T extends ClashLike>(clashes: T[], firstClassYmd: string): T[] {
  return clashes.filter((c) => c.date >= firstClassYmd);
}

/** Adds whole days to a calendar date written YYYY-MM-DD. */
export function addDaysYmd(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Where a class on `ymd` goes when its weekly window moves from `fromDay` to `toDay`: the new weekday in the same Sunday to Saturday week.
 * The caller moves it a week later when that lands in the past.
 */
export function sameWeekOn(ymd: string, fromDay: number, toDay: number): string {
  return addDaysYmd(ymd, toDay - fromDay);
}

/**
 * Which class of the new window each class of the old one becomes when a window is moved: the class at the same place (the first stays
 * the first). Refused when the new window is too short for a class someone is on.
 */
export function matchWindowClasses(usedChunkIndexes: number[], newChunkCount: number): { error: string } | { map: Map<number, number> } {
  const map = new Map<number, number>();
  for (const i of usedChunkIndexes) {
    if (i >= newChunkCount) return { error: `The new times hold ${newChunkCount} ${newChunkCount === 1 ? "class" : "classes"}, but someone is on class ${i + 1} of this window. Make the new window longer.` };
    map.set(i, i);
  }
  return { map };
}

/** One class to move when a day is closed: where it is now and where it goes (an Eastern date and start time). */
export interface DayMove {
  bookingId: string;
  date: string;
  time: string;
}

/** Checks the moves for a closed day: every class on the day listed once, each to a real date and time, and none left on the closed day. */
export function checkDayMoves(closedYmd: string, bookingIds: string[], moves: DayMove[]): { error: string } | { moves: DayMove[] } {
  const clean: DayMove[] = [];
  for (const m of moves) {
    const date = String(m?.date ?? "");
    const time = String(m?.time ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || minutesOfDay(time) === null) return { error: "Pick a day and a time for every class." };
    if (date === closedYmd) return { error: "Pick another day: that one is being closed." };
    clean.push({ bookingId: String(m.bookingId), date, time: hhmmOf(minutesOfDay(time)!) });
  }
  const ids = new Set(clean.map((m) => m.bookingId));
  if (ids.size !== clean.length) return { error: "A class is listed twice." };
  if (bookingIds.some((id) => !ids.has(id)) || clean.some((m) => !bookingIds.includes(m.bookingId))) return { error: "The classes on that day changed. Look again." };
  return { moves: clean };
}

/** "Ann and Bo", "Ann, Bo and Cy", "Ann, Bo and 3 more". */
export function namesList(names: string[], max = 3): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, max - 1).join(", ")} and ${names.length - (max - 1)} more`;
}
