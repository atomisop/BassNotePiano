/**
 * Pure rules for the owner's "Set up plan" (planSetup.ts) and for when a plan's weekly class may be booked. No database here, so
 * they are tested on their own (tests/planSetupRules.test.ts).
 */

/** How far ahead the first class can be set: twelve weeks. */
export const SETUP_MAX_WEEKS_AHEAD = 12;

/** The term a scholarship prices. Kept here as a plain string so this file needs nothing else. */
const SCHOLARSHIP_TERM = "TERM_6";

/** `replace` on a percent lower than the one claimed: the owner confirmed "End the current N% and give M%". */
export type ScholarshipChoice = { kind: "keep" } | { kind: "full" } | { kind: "percent"; percent: number; replace?: boolean };

/**
 * Whether a plan's weekly class starting at `scheduledAt` may be booked: never before the plan's first class (`startsAt`) and never
 * inside a pause (from `pausedAt` up to `pauseUntil`). Every booking of a plan's weekly class goes through this one check
 * (createReservedBookingIfAbsent), so the daily job, a weekly time move and an approval all follow it.
 */
export function planMayBookAt(plan: { startsAt?: Date | null; pausedAt?: Date | null; pauseUntil?: Date | null }, scheduledAt: Date): boolean {
  const t = scheduledAt.getTime();
  if (plan.startsAt && t < plan.startsAt.getTime()) return false;
  if (plan.pausedAt && plan.pauseUntil && t >= plan.pausedAt.getTime() && t < plan.pauseUntil.getTime()) return false;
  return true;
}

const parse = (ymd: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t);
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? t : null;
};

/** 0 for Sunday to 6 for Saturday, for a calendar date written YYYY-MM-DD. Null when it is not a real date. */
export function weekdayOfYmd(ymd: string): number | null {
  const t = parse(ymd);
  return t === null ? null : new Date(t).getUTCDay();
}

/**
 * Checks the chosen first class against the weekly time: it must be that weekday, not before the next class that has not started yet
 * (`nextClassYmd`), and at most SETUP_MAX_WEEKS_AHEAD weeks after it. Gives the whole weeks skipped between them (0 when the first class
 * is the next one), which is how far a running plan's dates move out.
 */
export function checkFirstClass(input: { firstClassYmd: string; dayOfWeek: number; nextClassYmd: string }): { error: string } | { weeksSkipped: number } {
  const first = parse(input.firstClassYmd);
  const next = parse(input.nextClassYmd);
  if (first === null || next === null) return { error: "Pick a real date for the first class." };
  if (new Date(first).getUTCDay() !== input.dayOfWeek) return { error: "The first class has to be on the weekly time's day. Pick one of the dates shown." };
  if (first < next) return { error: "That class has already started or passed. Pick a later date." };
  const weeks = Math.round((first - next) / (7 * 86_400_000));
  if (weeks > SETUP_MAX_WEEKS_AHEAD) return { error: `Pick a first class within ${SETUP_MAX_WEEKS_AHEAD} weeks.` };
  return { weeksSkipped: weeks };
}

/** Whole weeks from one calendar date to another (negative when `to` is earlier). */
export function weeksBetweenYmd(from: string, to: string): number {
  const a = parse(from);
  const b = parse(to);
  if (a === null || b === null) return 0;
  return Math.round((b - a) / (7 * 86_400_000));
}

/**
 * The scholarship the account ends up with. `current` is the best one already claimed. Keeping gives that; Full or a percent gives a
 * new studio scholarship when it is better than the current one. A lower one is never a side effect: it needs the owner's confirmed
 * "End the current N% and give M%" (`replace`), and then `ends` says which one is ended in the same step.
 */
export function resolveScholarship(current: number, choice: ScholarshipChoice): { error: string } | { percent: number; grant: number | null; ends?: number } {
  if (choice.kind === "keep") return { percent: current, grant: null };
  const target = choice.kind === "full" ? 100 : choice.percent;
  if (!Number.isInteger(target) || target < 1 || target > 100) return { error: "A scholarship is a whole number from 1 to 100 percent." };
  if (target < current) {
    if (choice.kind === "percent" && choice.replace) return { percent: target, grant: target, ends: current };
    return { error: `This account already has a ${current}% scholarship. To give ${target}% instead, confirm ending the ${current}% below.` };
  }
  if (target === current) return { percent: current, grant: null };
  return { percent: target, grant: target };
}

/** The plan length: a scholarship only prices the 6 Month plan, so any scholarship means 6 Months. Otherwise the length chosen. */
export function setupTerm<T extends string>(scholarshipPercent: number, requested: T): T | typeof SCHOLARSHIP_TERM {
  return scholarshipPercent > 0 ? SCHOLARSHIP_TERM : requested;
}

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * The one notice the student gets when the studio sets up their plan. Never mentions a payment when the plan costs nothing.
 * `started` is true when the plan has a paid (or covered) bill, so there is nothing to send to begin.
 */
export function planSetupNotice(input: { weekday: string; time: string; firstClassLabel: string; priceCents: number; started: boolean; scholarshipPercent: number }): { title: string; body: string } {
  let body = `Your weekly class is ${input.weekday}s at ${input.time}, starting ${input.firstClassLabel}.`;
  if (input.priceCents === 0) body += " Your scholarship covers everything, so there is nothing to pay.";
  else if (!input.started) body += ` Send the first payment (${usd(input.priceCents)}) to start your classes.`;
  else body += ` Your plan is ${usd(input.priceCents)} every 28 days${input.scholarshipPercent > 0 ? " with your scholarship" : ""}.`;
  return { title: "Your classes are set up", body };
}

/**
 * How a plan notice names its next bill. A $0 plan (a full scholarship) never has a payment to make, so it is never told one is due:
 * its next 28 days start on that day, covered.
 */
export function nextBillSentence(priceCents: number, dayLabel: string): string {
  return priceCents === 0 ? `Your next 28 days start on ${dayLabel}, covered by your scholarship.` : `Your next payment is due ${dayLabel}.`;
}

/** What moves with a pause, said without a payment for a $0 plan. */
export function pauseMovesSentence(priceCents: number): string {
  return priceCents === 0 ? "your plan dates and credits move back by the same time" : "your next payment and credits move back by the same time";
}
