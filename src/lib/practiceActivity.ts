import { prisma } from "@/lib/prisma";
import { computeStreak, etDayKey } from "@/lib/fingerPractice";
import {
  buildPracticeStrip,
  doneInLast7,
  minutesInLast7,
  recentDayKeys,
  type PracticeStripDay,
} from "@/lib/practiceActivityRules";

export interface StudentPracticeDetail {
  strip: PracticeStripDay[];
  streak: number;
  doneLast30: number;
  doneLast7: number;
  minutesLast7: number;
  /** Most recent day with the full 10 minutes, or null if never. */
  lastDoneDay: string | null;
}

/** The teacher's view of one student's daily finger practice. Reads only; nothing is changed. */
export async function getStudentPracticeDetail(userId: string): Promise<StudentPracticeDetail> {
  const today = etDayKey();
  const rows = await prisma.fingerPracticeDay.findMany({
    where: { userId },
    select: { day: true, seconds: true, completedAt: true },
    orderBy: { day: "desc" },
    take: 800,
  });
  const strip = buildPracticeStrip(rows, today, 30);
  const completed = new Set(rows.filter((r) => r.completedAt).map((r) => r.day));
  const lastDone = rows.find((r) => r.completedAt);
  return {
    strip,
    streak: computeStreak(completed, today),
    doneLast30: strip.filter((d) => d.state === "done").length,
    doneLast7: doneInLast7(strip),
    minutesLast7: minutesInLast7(strip),
    lastDoneDay: lastDone?.day ?? null,
  };
}

/** For the People list: how many of the last 7 days each person finished their 10 minutes (one query for all). */
export async function getDoneLast7ByUser(userIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (userIds.length === 0) return result;
  const days = recentDayKeys(etDayKey(), 7);
  const grouped = await prisma.fingerPracticeDay.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, day: { in: days }, completedAt: { not: null } },
    _count: { _all: true },
  });
  for (const g of grouped) result.set(g.userId, g._count._all);
  return result;
}
