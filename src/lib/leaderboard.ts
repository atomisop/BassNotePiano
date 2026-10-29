import { prisma } from "@/lib/prisma";
import { computeStreak, etDayKey } from "@/lib/fingerPractice";
import { weekStartKey } from "@/lib/homeRules";
import { rankLeaderboard } from "@/lib/leaderboardRules";

export interface LeaderboardRow {
  userId: string;
  name: string;
  image: string | null;
  minutes: number;
  streak: number;
  badges: number;
  place: number;
}

export interface WeeklyLeaderboard {
  rows: LeaderboardRow[];
  /** The Sunday this week started (YYYY-MM-DD, Eastern). */
  weekStart: string;
  /** The viewer turned on "hide me", so they are not on the board. */
  viewerHidden: boolean;
  /** The viewer is a child linked to a parent: children are never on the board. */
  viewerIsLinkedChild: boolean;
}

/** How many rows the full board shows: the studio is small, and this keeps the page light. */
const MAX_ROWS = 50;

/**
 * This week's practice minutes for the whole studio (Sunday to today, Eastern), ranked. Leaves out the admin, banned accounts,
 * children linked to a parent (the owner's decision, 2026-10-29) and anyone who chose to hide. Names are first name and last initial; nothing else about a person is shown.
 */
export async function getWeeklyLeaderboard(viewerId: string): Promise<WeeklyLeaderboard> {
  const today = etDayKey();
  const weekStart = weekStartKey(today);

  const [sums, viewer] = await Promise.all([
    prisma.fingerPracticeDay.groupBy({
      by: ["userId"],
      where: { day: { gte: weekStart, lte: today }, seconds: { gt: 0 } },
      _sum: { seconds: true },
    }),
    prisma.user.findUnique({
      where: { id: viewerId },
      select: { hideFromLeaderboard: true, parentLinksAsChild: { where: { status: "ACCEPTED" }, select: { id: true }, take: 1 } },
    }),
  ]);

  const ids = sums.map((s) => s.userId);
  const people = ids.length
    ? await prisma.user.findMany({
        where: {
          id: { in: ids },
          role: { not: "ADMIN" },
          bannedAt: null,
          hideFromLeaderboard: false,
          parentLinksAsChild: { none: { status: "ACCEPTED" } },
        },
        select: { id: true, name: true, username: true, image: true },
      })
    : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const ranked = rankLeaderboard(
    sums
      .filter((s) => byId.has(s.userId))
      .map((s) => ({ userId: s.userId, name: displayName(byId.get(s.userId)!), minutes: Math.floor((s._sum.seconds ?? 0) / 60) })),
  ).slice(0, MAX_ROWS);

  const shown = ranked.map((r) => r.userId);
  const [days, badgeCounts] = shown.length
    ? await Promise.all([
        prisma.fingerPracticeDay.findMany({
          where: { userId: { in: shown }, completedAt: { not: null }, day: { gte: shiftDays(today, -400) } },
          select: { userId: true, day: true },
        }),
        prisma.userBadge.groupBy({ by: ["userId"], where: { userId: { in: shown } }, _count: { _all: true } }),
      ])
    : [[], []];
  const daysByUser = new Map<string, Set<string>>();
  for (const d of days) {
    if (!daysByUser.has(d.userId)) daysByUser.set(d.userId, new Set());
    daysByUser.get(d.userId)!.add(d.day);
  }
  const badgesByUser = new Map(badgeCounts.map((b) => [b.userId, b._count._all]));

  return {
    weekStart,
    viewerHidden: Boolean(viewer?.hideFromLeaderboard),
    viewerIsLinkedChild: (viewer?.parentLinksAsChild.length ?? 0) > 0,
    rows: ranked.map((r) => ({
      ...r,
      image: byId.get(r.userId)?.image ?? null,
      streak: computeStreak(daysByUser.get(r.userId) ?? new Set(), today),
      badges: badgesByUser.get(r.userId) ?? 0,
    })),
  };
}

/** "Abebe K." from "Abebe Kebede"; the username when there is no name. */
function displayName(p: { name: string | null; username: string | null }): string {
  const parts = (p.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return p.username ?? "Student";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function shiftDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
