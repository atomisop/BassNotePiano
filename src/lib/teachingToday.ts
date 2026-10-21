import { prisma } from "@/lib/prisma";
import { etDayKey } from "@/lib/fingerPractice";
import { getDoneLast7ByUser } from "@/lib/practiceActivity";
import { discordLinkState } from "@/lib/discordLinkState";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";

export interface TodayStudent {
  bookingId: string;
  studentId: string;
  name: string;
  status: string;
  inPerson: boolean;
  firstClass: boolean;
  discord: { connected: boolean; name: string | null };
  credits: string;
  planLabel: string | null;
  billOverdue: boolean;
  scale: string | null;
  practicedDaysLast7: number | null;
  note: { body: string; at: Date } | null;
}

export interface TodaySlot {
  startsAt: Date;
  label: string | null;
  students: TodayStudent[];
}

const TERM_LABEL: Record<string, string> = { MONTHLY: "Monthly", TERM_3: "3-month", TERM_6: "6-month", TERM_12: "Yearly" };

/** Everything the teacher needs for today's classes (Eastern time), grouped by start time, in one read. */
export async function getTeachingDay(now: Date = new Date()): Promise<{ dayKey: string; slots: TodaySlot[] }> {
  const dayKey = etDayKey(now);
  const bookings = await prisma.classBooking.findMany({
    where: { status: { in: ["SCHEDULED", "COMPLETED"] }, scheduledAt: { gte: new Date(now.getTime() - 16 * 3_600_000), lte: new Date(now.getTime() + 40 * 3_600_000) } },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      scheduledAt: true,
      status: true,
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
          paymentPlans: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1, select: { term: true, nextDueDate: true, installmentsPaid: true } },
        },
      },
    },
  });
  const today = bookings.filter((b) => etDayKey(b.scheduledAt) === dayKey);
  const ids = [...new Set(today.map((b) => b.student.id))];
  if (ids.length === 0) return { dayKey, slots: [] };

  const [completed, notes, progress, practice] = await Promise.all([
    prisma.classBooking.groupBy({ by: ["studentId"], where: { studentId: { in: ids }, status: "COMPLETED", scheduledAt: { lt: now } }, _count: { _all: true } }),
    prisma.studentNote.findMany({ where: { studentId: { in: ids } }, orderBy: { createdAt: "desc" }, select: { studentId: true, body: true, createdAt: true } }),
    prisma.scaleProgress.findMany({
      where: { userId: { in: ids }, unlockedAt: { not: null }, completedAt: null },
      orderBy: { scaleGroup: { order: "asc" } },
      select: { userId: true, scaleGroup: { select: { code: true } } },
    }),
    getDoneLast7ByUser(ids),
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
      inPerson: b.inPerson,
      firstClass: (done.get(s.id) ?? 0) === 0,
      discord: discordLinkState({ discordId: s.discordId, discordUsername: s.discordUsername }),
      credits: creditsLabelFromStored(s.classCredits),
      planLabel: plan ? TERM_LABEL[plan.term] ?? plan.term : null,
      billOverdue: Boolean(plan && plan.nextDueDate.getTime() < now.getTime()),
      scale: scaleBy.get(s.id) ?? null,
      practicedDaysLast7: plan ? practice.get(s.id) ?? 0 : null,
      note: noteBy.get(s.id) ?? null,
    };
    const key = b.scheduledAt.getTime();
    const slot = slots.get(key) ?? { startsAt: b.scheduledAt, label: b.schedule.label, students: [] };
    slot.students.push(row);
    slots.set(key, slot);
  }
  return { dayKey, slots: [...slots.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()) };
}
