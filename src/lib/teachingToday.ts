import { prisma } from "@/lib/prisma";
import { etDayKey } from "@/lib/fingerPractice";
import { getDoneLast7ByUser } from "@/lib/practiceActivity";
import { discordLinkState } from "@/lib/discordLinkState";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";
import { getNextScales, type NextScaleInfo } from "@/lib/nextScaleSummary";
import { easternDayStart, easternDayWindow } from "@/lib/teachingDayRules";

export interface TodayStudent {
  bookingId: string;
  studentId: string;
  name: string;
  status: string;
  /** The mark already made for this class, if any. */
  attendance: "PRESENT" | "NO_SHOW" | null;
  inPerson: boolean;
  firstClass: boolean;
  discord: { connected: boolean; name: string | null };
  credits: string;
  planLabel: string | null;
  billOverdue: boolean;
  scale: string | null;
  practicedDaysLast7: number | null;
  note: { body: string; at: Date } | null;
  /** The next scale to release (full access only), so the teacher can approve it from the class row. */
  nextScale: NextScaleInfo | null;
}

export interface TodaySlot {
  startsAt: Date;
  label: string | null;
  students: TodayStudent[];
}

const TERM_LABEL: Record<string, string> = { MONTHLY: "Monthly", TERM_3: "3-month", TERM_6: "6-month", TERM_12: "Yearly" };

/**
 * Everything the teacher needs for one day's classes (Eastern time), grouped by start time, in one read. Today by default; `day`
 * ("YYYY-MM-DD") opens any other day, so the screen can step back and forward.
 */
export async function getTeachingDay(now: Date = new Date(), day?: string): Promise<{ dayKey: string; slots: TodaySlot[] }> {
  const dayKey = day ?? etDayKey(now);
  const window = easternDayWindow(dayKey);
  const bookings = await prisma.classBooking.findMany({
    where: { status: { in: ["SCHEDULED", "COMPLETED"] }, scheduledAt: { gte: window.from, lt: window.to } },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      scheduledAt: true,
      status: true,
      attendance: true,
      inPerson: true,
      schedule: { select: { label: true } },
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          classCredits: true,
          discordId: true,
          discordUsername: true,
          paymentPlans: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1, select: { term: true, nextDueDate: true, installmentsPaid: true, installmentAmountCents: true } },
        },
      },
    },
  });
  const today = bookings.filter((b) => etDayKey(b.scheduledAt) === dayKey);
  const ids = [...new Set(today.map((b) => b.student.id))];
  if (ids.length === 0) return { dayKey, slots: [] };

  // A first class is one with no class finished before this day (for today: before now, as before).
  const firstBefore = dayKey === etDayKey(now) ? now : easternDayStart(dayKey);
  const [completed, notes, progress, practice, nextScales] = await Promise.all([
    prisma.classBooking.groupBy({ by: ["studentId"], where: { studentId: { in: ids }, status: "COMPLETED", scheduledAt: { lt: firstBefore } }, _count: { _all: true } }),
    prisma.studentNote.findMany({ where: { studentId: { in: ids } }, orderBy: { createdAt: "desc" }, select: { studentId: true, body: true, createdAt: true } }),
    prisma.scaleProgress.findMany({
      where: { userId: { in: ids }, unlockedAt: { not: null }, completedAt: null },
      orderBy: { scaleGroup: { order: "asc" } },
      select: { userId: true, scaleGroup: { select: { code: true } } },
    }),
    getDoneLast7ByUser(ids),
    getNextScales(ids),
  ]);
  const done = new Map(completed.map((c) => [c.studentId, c._count._all]));
  const noteBy = new Map<string, { body: string; at: Date }>();
  for (const n of notes) if (!noteBy.has(n.studentId)) noteBy.set(n.studentId, { body: n.body, at: n.createdAt });
  const scaleBy = new Map<string, string>();
  for (const p of progress) scaleBy.set(p.userId, p.scaleGroup.code); // ordered ascending, so the last (newest open) wins

  const slots = new Map<number, TodaySlot>();
  for (const b of today) {
    const s = b.student;
    const plan = s.paymentPlans[0];
    const row: TodayStudent = {
      bookingId: b.id,
      studentId: s.id,
      name: s.name ?? s.email,
      status: b.status,
      attendance: b.attendance ?? null,
      inPerson: b.inPerson,
      firstClass: (done.get(s.id) ?? 0) === 0,
      discord: discordLinkState({ discordId: s.discordId, discordUsername: s.discordUsername }),
      credits: creditsLabelFromStored(s.classCredits),
      planLabel: plan ? TERM_LABEL[plan.term] ?? plan.term : null,
      // A plan that costs nothing (a full scholarship) has no bill to be late with.
      billOverdue: Boolean(plan && plan.installmentAmountCents > 0 && plan.nextDueDate.getTime() < now.getTime()),
      scale: scaleBy.get(s.id) ?? null,
      practicedDaysLast7: plan ? practice.get(s.id) ?? 0 : null,
      note: noteBy.get(s.id) ?? null,
      nextScale: nextScales.get(s.id) ?? null,
    };
    const key = b.scheduledAt.getTime();
    const slot = slots.get(key) ?? { startsAt: b.scheduledAt, label: b.schedule.label, students: [] };
    slot.students.push(row);
    slots.set(key, slot);
  }
  return { dayKey, slots: [...slots.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()) };
}

export interface StillToMarkRow {
  bookingId: string;
  studentId: string;
  name: string;
  scheduledAt: Date;
  label: string | null;
  inPerson: boolean;
}

/**
 * Classes from before `day` (an Eastern "YYYY-MM-DD") that still have no Present or No-show: marked right on the Today screen instead
 * of on Schedule > Attendance. Oldest first, the first `take` of them, with how many there are in all.
 */
export async function getStillToMark(day: string, take = 25): Promise<{ rows: StillToMarkRow[]; total: number }> {
  const where = { status: "SCHEDULED" as const, scheduledAt: { lt: easternDayStart(day) } };
  const [rows, total] = await Promise.all([
    prisma.classBooking.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      take,
      select: { id: true, scheduledAt: true, inPerson: true, schedule: { select: { label: true } }, student: { select: { id: true, name: true, email: true } } },
    }),
    prisma.classBooking.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((b) => ({ bookingId: b.id, studentId: b.student.id, name: b.student.name ?? b.student.email, scheduledAt: b.scheduledAt, label: b.schedule.label, inPerson: b.inPerson })),
  };
}

/** How many students have a class on each of the next 7 days (today first, Eastern time): the Overview's week strip. */
export async function getWeekSchedule(now: Date = new Date()): Promise<{ dayKey: string; weekday: string; day: number; students: number }[]> {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() + i * 86_400_000);
    return {
      dayKey: etDayKey(d),
      weekday: d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" }),
      day: Number(d.toLocaleDateString("en-US", { timeZone: "America/New_York", day: "numeric" })),
      students: 0,
    };
  });
  const bookings = await prisma.classBooking.findMany({
    where: { status: { in: ["SCHEDULED", "COMPLETED"] }, scheduledAt: { gte: new Date(now.getTime() - 24 * 3_600_000), lte: new Date(now.getTime() + 8 * 86_400_000) } },
    select: { scheduledAt: true },
  });
  const index = new Map(days.map((d, i) => [d.dayKey, i]));
  for (const b of bookings) {
    const i = index.get(etDayKey(b.scheduledAt));
    if (i !== undefined) days[i].students += 1;
  }
  return days;
}
