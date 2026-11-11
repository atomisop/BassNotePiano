import { prisma } from "@/lib/prisma";

// "Due this week" for the Overview: which subscribers have a bill coming up in the next 7 days, on which day, for how much, and
// which ones are already past due. Days are Eastern calendar days, the same clock the rest of the admin shows.

const ZONE = "America/New_York";
const DAY_MS = 86_400_000;

export interface DuePlan {
  userId: string;
  name: string;
  amountCents: number;
  nextDueDate: Date;
}

export interface DueDay {
  key: string;
  weekday: string;
  dayOfMonth: string;
  isToday: boolean;
  count: number;
  cents: number;
}

export interface DueItem extends DuePlan {
  dayKey: string;
}

export interface DueWeek {
  days: DueDay[];
  items: DueItem[];
  overdue: (DuePlan & { daysLate: number })[];
  totalCents: number;
  overdueCents: number;
}

/** The Eastern calendar day (YYYY-MM-DD) an instant falls on. */
export function easternDayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: ZONE });
}

/** Pure, so it is tested: seven day buckets from today, the bills inside them with who and when, and the ones already late. */
export function buildDueWeek(plans: DuePlan[], now: Date = new Date()): DueWeek {
  const end = now.getTime() + 7 * DAY_MS;
  const days: DueDay[] = Array.from({ length: 7 }, (_, i) => {
    const at = new Date(now.getTime() + i * DAY_MS);
    return {
      key: easternDayKey(at),
      weekday: at.toLocaleDateString("en-US", { timeZone: ZONE, weekday: "short" }),
      dayOfMonth: at.toLocaleDateString("en-US", { timeZone: ZONE, day: "numeric" }),
      isToday: i === 0,
      count: 0,
      cents: 0,
    };
  });
  const items: DueItem[] = [];
  const overdue: (DuePlan & { daysLate: number })[] = [];
  for (const plan of plans) {
    const due = plan.nextDueDate.getTime();
    if (due < now.getTime()) {
      overdue.push({ ...plan, daysLate: Math.max(1, Math.floor((now.getTime() - due) / DAY_MS)) });
    } else if (due <= end) {
      const dayKey = easternDayKey(plan.nextDueDate);
      items.push({ ...plan, dayKey });
      const day = days.find((d) => d.key === dayKey);
      if (day) {
        day.count += 1;
        day.cents += plan.amountCents;
      }
    }
  }
  items.sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime());
  overdue.sort((a, b) => b.daysLate - a.daysLate);
  return {
    days,
    items,
    overdue,
    totalCents: items.reduce((s, i) => s + i.amountCents, 0),
    overdueCents: overdue.reduce((s, o) => s + o.amountCents, 0),
  };
}

export async function getDueWeek(now: Date = new Date()): Promise<DueWeek> {
  const plans = await prisma.paymentPlan.findMany({
    // Money that is due: a plan that costs nothing (a full scholarship) has none.
    where: { status: "ACTIVE", installmentsPaid: { gte: 1 }, installmentAmountCents: { gt: 0 } },
    select: { installmentAmountCents: true, nextDueDate: true, user: { select: { id: true, name: true, email: true } } },
  });
  return buildDueWeek(
    plans.map((p) => ({ userId: p.user.id, name: p.user.name?.trim() || p.user.email, amountCents: p.installmentAmountCents, nextDueDate: p.nextDueDate })),
    now,
  );
}
