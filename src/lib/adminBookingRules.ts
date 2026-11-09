import { creditsLabelFromStored, formatCredits, storedToCredits } from "@/lib/classCreditPricing";

/**
 * The words and small checks the studio's booking screens share (Book a class on a student's page, Schedule > Requests and
 * Reserved). Pure, so the browser and the server say the same thing. Booking itself lives in classSchedule.ts and adminBooking.ts.
 */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ET = "America/New_York";

/** The weekday (0 = Sunday) of a "YYYY-MM-DD" day, or null when it is not a real date. */
export function weekdayOf(dateKey: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.toISOString().slice(0, 10) === dateKey ? date.getUTCDay() : null;
}

/** True when the studio has no weekly times on this day's weekday (`weekdays` lists the ones it teaches). */
export function isOffDay(dateKey: string, weekdays: number[]): boolean {
  const weekday = weekdayOf(dateKey);
  return weekday !== null && !weekdays.includes(weekday);
}

/** "You don't usually teach Saturdays. Use it anyway?" */
export function offDayQuestion(dateKey: string): string {
  const weekday = weekdayOf(dateKey);
  return `You don't usually teach ${weekday === null ? "that day" : `${DAY_NAMES[weekday]}s`}. Use it anyway?`;
}

/** Today's Eastern calendar day, "YYYY-MM-DD". */
export function etTodayKey(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: ET });
}

/** True when this Eastern date and start time ("YYYY-MM-DD", "HH:mm") is already past at `now`. */
export function isPastEt(dateKey: string, time: string, now: Date = new Date()): boolean {
  const today = etTodayKey(now);
  if (dateKey !== today) return dateKey < today;
  const clock = now.toLocaleTimeString("en-GB", { timeZone: ET, hour: "2-digit", minute: "2-digit", hour12: false });
  return time <= clock;
}

/** "Thu, Nov 12 at 4:05 PM" for a typed Eastern day and start time ("YYYY-MM-DD", "HH:mm"). */
export function typedTimeLabel(dateKey: string, time: string): string {
  const weekday = weekdayOf(dateKey);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (weekday === null || !t) return `${dateKey} at ${time}`;
  const day = new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  const h = Number(t[1]);
  return `${day} at ${h % 12 === 0 ? 12 : h % 12}:${t[2]} ${h >= 12 ? "PM" : "AM"}`;
}

/** "Sam" from "Sam Lee"; the email's name part when there is no name. */
export function firstNameOf(person: { name: string | null; email: string }): string {
  const first = (person.name ?? "").trim().split(/\s+/)[0];
  return first || person.email.split("@")[0];
}

/**
 * The studio's version of "You need 1 credit available": names the student, says what they have, and says who can fix it.
 * `available` and `needed` are stored units (see classCreditPricing.ts).
 */
export function creditShortMessage(first: string, available: number, needed: number, canAddCredit: boolean): string {
  const free = storedToCredits(Math.max(0, available));
  const has = free === 0 ? `${first} has no free credit` : `${first} has only ${formatCredits(free)} free`;
  const ask = canAddCredit ? "" : " Only the owner can add credits.";
  return `${has}, and this class needs ${creditsLabelFromStored(needed)}.${ask}`;
}

/**
 * The questions a studio booking asks before it runs, one at a time, in this order: a day the studio does not usually teach, then
 * a typed time (a new one-time slot, or a class already taught when it is past and `recordPast`), then a plan's weekly time, then
 * a contact's soft hold. Each is asked once; `acks` holds the ones already answered yes. Null when nothing is left to ask.
 */
export type BookingAsk = "offday" | "new" | "past" | "plan" | "contact";

export function nextBookingAsk(
  acks: ReadonlySet<BookingAsk>,
  c: { typed: boolean; day: string | null; time: string; weekdays: number[]; heldBy?: string; heldFor?: string; recordPast: boolean; now?: Date },
): BookingAsk | null {
  const asks: BookingAsk[] = [];
  if (c.typed && c.day && isOffDay(c.day, c.weekdays)) asks.push("offday");
  if (c.typed && c.day) asks.push(c.recordPast && isPastEt(c.day, c.time, c.now) ? "past" : "new");
  if (!c.typed && c.heldBy) asks.push("plan");
  if (!c.typed && c.heldFor) asks.push("contact");
  return asks.find((a) => !acks.has(a)) ?? null;
}

/** "Add 1 credit and book", for the credit the student is short. */
export function addCreditLabel(shortBy: number, verb = "book"): string {
  return `Add ${creditsLabelFromStored(Math.max(1, shortBy))} and ${verb}`;
}
