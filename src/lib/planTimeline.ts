// The whole life of a payment plan laid out as dates, from a start date that may be in the past: cycle by cycle (28 days each),
// which weekly classes fall in each, which are already taught, which are booked, which are missed or not paid for yet, and when the
// next bill lands. Pure (no database), so it is tested, and the plan builder shows it as a preview before anything is written.

export const CYCLE_DAYS = 28;

export type TimelineClassState = "taught" | "booked" | "missed" | "unpaid";

export interface TimelineClass {
  /** The Eastern date, YYYY-MM-DD. */
  date: string;
  state: TimelineClassState;
}

export interface TimelineCycle {
  number: number;
  startsOn: string;
  /** The bill date that follows this cycle. */
  endsOn: string;
  paid: boolean;
  classes: TimelineClass[];
}

export interface PlanTimeline {
  cycles: TimelineCycle[];
  /** The next bill (the end of the last paid cycle), or null when every cycle is paid. */
  nextBill: string | null;
  taughtCount: number;
  bookedCount: number;
}

export function parseYmd(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null;
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (date: string, days: number): string => ymd(new Date(parseYmd(date)!.getTime() + days * 86_400_000));

/**
 * `slotAt` turns an Eastern date into the instant the weekly class starts that day, so a class earlier today counts as passed and one
 * later today as still to come.
 */
export function buildPlanTimeline(args: {
  startDate: string;
  cycles: number;
  installmentsPaid: number;
  dayOfWeek: number;
  slotAt: (date: string) => Date;
  taughtDates: string[];
  now: Date;
}): PlanTimeline {
  const { startDate, cycles, installmentsPaid, dayOfWeek, slotAt, now } = args;
  const taught = new Set(args.taughtDates);
  const start = parseYmd(startDate);
  if (!start) throw new Error("Not a real date.");
  const firstOffset = (dayOfWeek - start.getUTCDay() + 7) % 7;

  const out: TimelineCycle[] = [];
  let taughtCount = 0;
  let bookedCount = 0;
  for (let c = 0; c < cycles; c++) {
    const paid = c < installmentsPaid;
    const classes: TimelineClass[] = [];
    for (let j = 0; j < 4; j++) {
      const date = addDays(startDate, firstOffset + 7 * (4 * c + j));
      const state: TimelineClassState = taught.has(date) ? "taught" : slotAt(date).getTime() <= now.getTime() ? "missed" : paid ? "booked" : "unpaid";
      if (state === "taught") taughtCount++;
      if (state === "booked") bookedCount++;
      classes.push({ date, state });
    }
    out.push({ number: c + 1, startsOn: addDays(startDate, CYCLE_DAYS * c), endsOn: addDays(startDate, CYCLE_DAYS * (c + 1)), paid, classes });
  }
  const nextBill = installmentsPaid > 0 && installmentsPaid < cycles ? addDays(startDate, CYCLE_DAYS * installmentsPaid) : null;
  return { cycles: out, nextBill, taughtCount, bookedCount };
}
