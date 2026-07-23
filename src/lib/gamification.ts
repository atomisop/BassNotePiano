import type { BadgeCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Idempotent — the unique (userId, code) constraint makes a re-award a no-op. */
async function awardBadge(userId: string, code: BadgeCode) {
  await prisma.userBadge.upsert({
    where: { userId_code: { userId, code } },
    update: {},
    create: { userId, code },
  });
}

const COURSE_MILESTONES: { completedCount: number; code: BadgeCode }[] = [
  { completedCount: 1, code: "FIRST_LESSON_DONE" },
  { completedCount: 2, code: "SCALE_MASTER" },
  { completedCount: 4, code: "RHYTHM_SPECIALIST" },
  { completedCount: 5, code: "CHORD_MAESTRO" },
  { completedCount: 6, code: "COURSE_GRADUATE" },
];

/** Call after a ScaleProgress row transitions to COMPLETED. */
export async function checkCourseBadges(userId: string): Promise<void> {
  const completedCount = await prisma.scaleProgress.count({ where: { userId, status: "COMPLETED" } });
  const earned = COURSE_MILESTONES.filter((m) => completedCount >= m.completedCount);
  await Promise.all(earned.map((m) => awardBadge(userId, m.code)));
}

const STREAK_MILESTONES: { days: number; code: BadgeCode }[] = [
  { days: 3, code: "STREAK_3_DAY" },
  { days: 7, code: "STREAK_7_DAY" },
  { days: 30, code: "STREAK_30_DAY" },
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);
}

/**
 * Called from every practice-related action (module read, practice logged,
 * quiz attempted) — bumps the streak at most once per calendar day. A gap
 * of more than one day resets the streak to 1 rather than 0, since today's
 * action itself counts.
 */
export async function recordPracticeActivity(userId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { currentStreak: true, longestStreak: true, lastActivityDate: true },
  });

  const now = new Date();
  if (user.lastActivityDate && daysBetween(user.lastActivityDate, now) === 0) {
    return; // already counted today
  }

  const gap = user.lastActivityDate ? daysBetween(user.lastActivityDate, now) : null;
  const newStreak = gap === 1 ? user.currentStreak + 1 : 1;
  const newLongest = Math.max(user.longestStreak, newStreak);

  await prisma.user.update({
    where: { id: userId },
    data: { currentStreak: newStreak, longestStreak: newLongest, lastActivityDate: now },
  });

  const earned = STREAK_MILESTONES.filter((m) => newStreak >= m.days);
  await Promise.all(earned.map((m) => awardBadge(userId, m.code)));
}
