// What the bill bar at the top of the signed-in app says (BillBar.tsx). Pure, so it is tested. Days are counted by the
// viewer's calendar: the due day itself is still "due today", the day after is the first day late.

export type BillBarStage = "reminder" | "late" | "countdown";

export interface BillBarText {
  stage: BillBarStage;
  title: string;
  body: string;
}

/** Late days 1 and 2 say the payment is missing; from day 3 the bar counts down to the lock. */
export const LATE_WARNING_DAYS = 2;

function startOfDay(d: Date, timeZone?: string): number {
  if (!timeZone) return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // The calendar day in a named time zone, as a plain day number (only differences between two of these are used).
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d).split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

/**
 * `timeZone` is only for the very first paint: the server and the browser must write the same words before the page comes alive, so
 * both use the studio's clock there. Without it (every later render) the days are the viewer's own.
 */
export function billBarText(bill: { amountCents: number; dueDate: string; lapseAfterDays: number }, now: Date, timeZone?: string): BillBarText {
  const amount = `$${(bill.amountCents / 100).toFixed(2)}`;
  const due = new Date(bill.dueDate);
  const daysLeft = Math.round((startOfDay(due, timeZone) - startOfDay(now, timeZone)) / 86_400_000);
  if (daysLeft >= 0) {
    const when = daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `on ${due.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone })}`;
    return { stage: "reminder", title: "Your next bill is ready", body: `${amount} is due ${when}. Pay any time before then to keep your classes going.` };
  }
  const late = -daysLeft;
  if (late <= LATE_WARNING_DAYS) {
    return {
      stage: "late",
      title: "We still haven't received your payment",
      body: `We have no record of your ${amount} payment yet. Please send it soon, or you might lose access to your account.`,
    };
  }
  const left = Math.max(0, bill.lapseAfterDays - late);
  return {
    stage: "countdown",
    title: left === 0 ? "You will lose access today" : `You will lose access in ${left} day${left === 1 ? "" : "s"}`,
    body: `Please send us the ${amount} payment to keep your account.`,
  };
}
