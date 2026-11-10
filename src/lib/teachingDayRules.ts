// Pure date rules for the Today screen (/admin/schedule?view=TODAY&day=YYYY-MM-DD). No database, so they are tested on their own.
// Every day here is an Eastern calendar day written as "YYYY-MM-DD", the same key `etDayKey` makes.

const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The Eastern calendar day of an instant, as "YYYY-MM-DD". */
export function easternDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** The `?day=` from the address when it is a real date, else today. A typo never breaks the page. */
export function parseDayParam(param: string | string[] | undefined, today: string): string {
  const raw = Array.isArray(param) ? param[0] : param;
  const m = raw ? KEY.exec(raw.trim()) : null;
  if (!m) return today;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Rejects 2026-02-31 and the like, which Date would quietly roll into March.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return today;
  if (y < 2000 || y > 2100) return today;
  return raw!.trim();
}

/** The day `delta` days before or after `key`. */
export function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/**
 * The instant an Eastern day starts. Midnight Eastern is 04:00 UTC in summer time and 05:00 UTC in winter; the clocks change at 2am,
 * so midnight always has the offset of the day before the change and one check is enough.
 */
export function easternDayStart(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const summer = new Date(Date.UTC(y, m - 1, d, 4));
  return easternDay(summer) === key ? summer : new Date(Date.UTC(y, m - 1, d, 5));
}

/** A window of instants that surely holds the whole Eastern day (rows are then kept by their own Eastern day). */
export function easternDayWindow(key: string): { from: Date; to: Date } {
  const start = easternDayStart(key);
  return { from: start, to: new Date(start.getTime() + 26 * 3_600_000) };
}

/** "Today", "Tomorrow", "Yesterday", else the weekday: the word above a day's classes. */
export function dayWord(key: string, today: string): string {
  if (key === today) return "Today";
  if (key === shiftDay(today, 1)) return "Tomorrow";
  if (key === shiftDay(today, -1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" });
}

/** "Wednesday, March 12" for the day line under the arrows. */
export function dayLong(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
}

/** The line between the arrows: "Today, March 12", or "Wednesday, March 12" for a day that is not next to today. */
export function dayTitle(key: string, today: string): string {
  const [weekday, date] = dayLong(key).split(", ");
  const word = dayWord(key, today);
  return `${word === weekday ? weekday : word}, ${date}`;
}

/** The Today screen's address for a day: /admin/schedule?view=TODAY for today itself, so the everyday link stays short. */
export function todayHref(key: string, today: string): string {
  return key === today ? "/admin/schedule?view=TODAY" : `/admin/schedule?view=TODAY&day=${key}`;
}
