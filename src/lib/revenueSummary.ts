import { etDayKey } from "@/lib/fingerPractice";

const DAY = 86_400_000;

export interface RevenueBucket {
  label: string;
  cents: number;
}

export interface RevenueSummary {
  /** The last 7 days, and the 7 before them. */
  weekCents: number;
  prevWeekCents: number;
  /** This calendar month so far (Eastern time), and all of last month. */
  monthCents: number;
  prevMonthCents: number;
  /** The last `weeks` 7-day stretches, oldest first; the last one is this week. */
  weeks: RevenueBucket[];
  /** The last `months` calendar months, oldest first; the last one is this month. */
  months: RevenueBucket[];
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10" for the month `back` months before `key`'s month. */
function monthKeyBefore(key: string, back: number): string {
  const [y, m] = key.split("-").map(Number);
  const i = y * 12 + (m - 1) - back;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/**
 * Money that came in, by week and by month, from approved payments (each dated by when it was approved). Weeks are rolling 7-day
 * stretches ending now, so "this week" is never a half-empty calendar week; months are calendar months in the studio's time zone.
 */
export function summariseRevenue(rows: { at: Date; amountCents: number }[], now: Date, weeks = 8, months = 6): RevenueSummary {
  const weekBuckets: RevenueBucket[] = Array.from({ length: weeks }, (_, i) => {
    const end = new Date(now.getTime() - (weeks - 1 - i) * 7 * DAY);
    return { label: end.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }), cents: 0 };
  });
  const thisMonth = etDayKey(now).slice(0, 7);
  const monthKeys = Array.from({ length: months }, (_, i) => monthKeyBefore(thisMonth, months - 1 - i));
  const monthBuckets: RevenueBucket[] = monthKeys.map((k) => ({ label: MONTH[Number(k.slice(5)) - 1], cents: 0 }));
  const prevMonth = monthKeyBefore(thisMonth, 1);
  let prevMonthCents = 0;

  for (const r of rows) {
    const age = now.getTime() - r.at.getTime();
    if (age >= 0) {
      const w = Math.floor(age / (7 * DAY));
      if (w < weeks) weekBuckets[weeks - 1 - w].cents += r.amountCents;
    }
    const mk = etDayKey(r.at).slice(0, 7);
    const mi = monthKeys.indexOf(mk);
    if (mi >= 0) monthBuckets[mi].cents += r.amountCents;
    if (mk === prevMonth) prevMonthCents += r.amountCents;
  }

  const prevWeekCents = rows
    .filter((r) => now.getTime() - r.at.getTime() >= 7 * DAY && now.getTime() - r.at.getTime() < 14 * DAY)
    .reduce((n, r) => n + r.amountCents, 0);
  const weekCents = rows.filter((r) => now.getTime() - r.at.getTime() >= 0 && now.getTime() - r.at.getTime() < 7 * DAY).reduce((n, r) => n + r.amountCents, 0);

  return {
    weekCents,
    prevWeekCents,
    monthCents: rows.filter((r) => etDayKey(r.at).slice(0, 7) === thisMonth).reduce((n, r) => n + r.amountCents, 0),
    prevMonthCents,
    weeks: weekBuckets,
    months: monthBuckets,
  };
}

/** "+12%" / "-5%" against the earlier figure, or null when there is nothing to compare with. */
export function changeLabel(now: number, before: number): string | null {
  if (before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? "+" : "-"}${Math.abs(pct)}%`;
}
