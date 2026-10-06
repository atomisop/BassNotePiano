import { prisma } from "@/lib/prisma";
import { awardBadge } from "@/lib/gamification";
import { DAILY_GOAL_SECONDS, FINGER_LEVELS, type FingerPracticeStatus } from "@/lib/fingerPracticeConstants";

export { DAILY_GOAL_SECONDS, FINGER_LEVELS };
export type { FingerPracticeStatus };

const ET_ZONE = "America/New_York";

/** YYYY-MM-DD for an instant, as the calendar reads in ET. */
export function etDayKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ET_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function previousDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** Consecutive completed days ending today, or yesterday if today is not done yet. */
export function computeStreak(completedDays: Set<string>, today: string = etDayKey()): number {
  let cursor = completedDays.has(today) ? today : previousDayKey(today);
  let streak = 0;
  while (completedDays.has(cursor)) {
    streak++;
    cursor = previousDayKey(cursor);
  }
  return streak;
}

export async function getFingerPracticeStatus(userId: string): Promise<FingerPracticeStatus> {
  const today = etDayKey();
  const rows = await prisma.fingerPracticeDay.findMany({
    where: { userId, completedAt: { not: null } },
    select: { day: true },
    orderBy: { day: "desc" },
    take: 800,
  });
  const todayRow = await prisma.fingerPracticeDay.findUnique({ where: { userId_day: { userId, day: today } }, select: { seconds: true } });
  const completed = new Set(rows.map((r) => r.day));
  const streak = computeStreak(completed, today);
  return {
    todaySeconds: Math.min(todayRow?.seconds ?? 0, DAILY_GOAL_SECONDS),
    completedToday: completed.has(today),
    streak,
  };
}

/** Whether today's 10 minutes are done: the gate in front of the scale lessons. */
export async function hasCompletedFingerPracticeToday(userId: string): Promise<boolean> {
  const row = await prisma.fingerPracticeDay.findUnique({ where: { userId_day: { userId, day: etDayKey() } }, select: { completedAt: true } });
  return !!row?.completedAt;
}

// A heartbeat counts the time the server saw pass since the last one, up to
// this much, so a browser cannot claim minutes it did not practice.
const MAX_BEAT_SECONDS = 20;
const FIRST_BEAT_SECONDS = 5;

/**
 * Called about every 15 seconds while the practice timer runs. Adds the real
 * elapsed time (capped), and when the day reaches the goal marks it complete
 * and awards any finger level the new streak has reached.
 */
export async function recordPracticeBeat(userId: string): Promise<FingerPracticeStatus & { justCompleted: boolean }> {
  const day = etDayKey();
  const now = new Date();
  const row = await prisma.fingerPracticeDay.upsert({
    where: { userId_day: { userId, day } },
    update: {},
    create: { userId, day },
  });

  let justCompleted = false;
  if (!row.completedAt) {
    const sinceLast = row.lastBeatAt ? (now.getTime() - row.lastBeatAt.getTime()) / 1000 : null;
    const add = sinceLast === null || sinceLast > 45 ? FIRST_BEAT_SECONDS : Math.min(MAX_BEAT_SECONDS, Math.max(0, Math.floor(sinceLast)));
    const seconds = Math.min(DAILY_GOAL_SECONDS, row.seconds + add);
    const done = seconds >= DAILY_GOAL_SECONDS;
    const claimed = await prisma.fingerPracticeDay.updateMany({
      where: { id: row.id, completedAt: null },
      data: { seconds, lastBeatAt: now, ...(done ? { completedAt: now } : {}) },
    });
    justCompleted = done && claimed.count === 1;
  }

  if (justCompleted) {
    const status = await getFingerPracticeStatus(userId);
    await Promise.all(FINGER_LEVELS.filter((l) => status.streak >= l.days).map((l) => awardBadge(userId, l.code)));
  }
  return { ...(await getFingerPracticeStatus(userId)), justCompleted };
}
