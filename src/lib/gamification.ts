import type { BadgeCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SCALE_GROUPS } from "@/lib/curriculum";
import { BADGES } from "@/lib/badges";
import { createNotification } from "@/lib/notifications";

/** Idempotent — the unique (userId, code) constraint makes a re-award a no-op. */
async function awardBadge(userId: string, code: BadgeCode) {
  const existing = await prisma.userBadge.findUnique({ where: { userId_code: { userId, code } }, select: { id: true } });
  if (existing) return;
  try {
    await prisma.userBadge.create({ data: { userId, code } });
  } catch (err) {
    // A concurrent award won the race: it sends the notification, so this one stays quiet.
    if ((err as { code?: string })?.code === "P2002") return;
    throw err;
  }
  const label = BADGES.find((badge) => badge.code === code)?.label ?? "new";
  await createNotification({
    userId,
    type: "BADGE_EARNED",
    title: `You earned the ${label} badge \u{1F389}`,
  }).catch((err) => console.error("Badge notification failed (non-blocking):", err));
}

const COURSE_MILESTONES: { completedCount: number; code: BadgeCode }[] = [
  { completedCount: 1, code: "FIRST_LESSON_DONE" },
  { completedCount: 4, code: "SCALE_MASTER" },
  { completedCount: 8, code: "RHYTHM_SPECIALIST" },
  { completedCount: 12, code: "CHORD_MAESTRO" },
  // Derived from SCALE_GROUPS.length rather than hardcoded — the last time
  // this was a literal (6), growing the curriculum to 15 scales silently
  // made "Course Graduate" fire 9 scales early.
  { completedCount: SCALE_GROUPS.length, code: "COURSE_GRADUATE" },
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

const FRIEND_COUNT_MILESTONES: { count: number; code: BadgeCode }[] = [
  { count: 1, code: "FIRST_FRIEND_ADDED" },
  { count: 5, code: "COMMUNITY_CATALYST" },
];

/**
 * Call whenever a friend request is accepted, for both participants — a
 * request has two sides, and either one crossing a milestone should award
 * it. ACTIVE_PRACTICE_PARTNER isn't checked here or anywhere yet: this app
 * has no synchronous "practice together" mechanic to honestly measure, so
 * it stays defined but unawarded rather than wired to a proxy metric that
 * doesn't really mean what the badge claims.
 */
export async function checkSocialBadges(userId: string): Promise<void> {
  const friendCount = await prisma.friendRequest.count({
    where: { status: "ACCEPTED", OR: [{ senderId: userId }, { receiverId: userId }] },
  });
  const earned = FRIEND_COUNT_MILESTONES.filter((m) => friendCount >= m.count);
  await Promise.all(earned.map((m) => awardBadge(userId, m.code)));
}
