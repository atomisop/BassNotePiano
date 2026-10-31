import { cache } from "react";
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

/** The longest run of consecutive completed days ever (the best streak). */
export function longestStreak(completedDays: Set<string>): number {
  let best = 0;
  for (const day of completedDays) {
    // Count only from the first day of each run.
    const before = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) - 1)).toISOString().slice(0, 10);
    if (completedDays.has(before)) continue;
    let run = 0;
    let cursor = day;
    while (completedDays.has(cursor)) {
      run++;
      cursor = new Date(Date.UTC(+cursor.slice(0, 4), +cursor.slice(5, 7) - 1, +cursor.slice(8, 10) + 1)).toISOString().slice(0, 10);
    }
    best = Math.max(best, run);
  }
  return best;
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
    longest: longestStreak(completed),
  };
}

/**
 * The same status, read once per page load: Home, the top bar's status and the sidebar card all ask for it while one page renders,
 * and each used to run its own queries (2026-10-31 speed pass). Not for code that changes practice and then reads it back.
 */
export const getFingerPracticeStatusOnce = cache(getFingerPracticeStatus);

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
