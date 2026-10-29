import { prisma } from "@/lib/prisma";
import { getRoadmap } from "@/lib/access";
import { getCurriculumEntitlement } from "@/lib/entitlement";
import { DAILY_GOAL_SECONDS, etDayKey, getFingerPracticeStatus, type FingerPracticeStatus } from "@/lib/fingerPractice";
import { putFingerPracticeFirst, resolveNextStep, summariseProgress, type NextStep } from "@/lib/next-step";
import { gettingStartedStep } from "@/lib/lockedScale";
import { getBoolSetting, getNumberSetting } from "@/lib/siteSettings";
import { BADGES } from "@/lib/badges";
import { STREAK_GOALS } from "@/lib/streakRules";
import { minutesThisWeek, pickCelebration, tipOfTheDay, weekStartKey, type Win } from "@/lib/homeRules";

export interface HomeData {
  name: string | null;
  /** No plan and no trial yet (and not the admin): Home shows the free trial welcome instead of the student cards. */
  isNew: boolean;
  nextStep: NextStep;
  progress: ReturnType<typeof summariseProgress>;
  /** The scale the student is on now, for the roadmap card. */
  currentScale: { code: string; title: string } | null;
  nextClass: { scheduledAt: Date; creditsSpent: number; discordChannelId: string | null; inPerson: boolean } | null;
  practice: FingerPracticeStatus;
  weekMinutes: number;
  friendCount: number;
  /** First names of friends practicing right now. */
  friendsPracticing: string[];
  celebration: Win | null;
  tip: { title: string; body: string };
}

/** Everything the Home screen shows, in one round of queries. */
export async function getHomeData(user: { id: string; role: string; email: string | null }): Promise<HomeData> {
  const userId = user.id;
  const now = new Date();
  const today = etDayKey(now);
  const isAdmin = user.role === "ADMIN";

  const [roadmap, profile, practice, nextClass, entitlement, pendingApplication, weekRows, badges, unlocks, friendRows] = await Promise.all([
    getRoadmap(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    getFingerPracticeStatus(userId),
    // Still counts for an hour after it starts, so "Join" is there if they are a little late.
    prisma.classBooking.findFirst({
      where: { studentId: userId, status: "SCHEDULED", scheduledAt: { gt: new Date(now.getTime() - 60 * 60_000) } },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true, creditsSpent: true, discordChannelId: true, inPerson: true },
    }),
    getCurriculumEntitlement(userId),
    prisma.classRegistration.count({
      where: { status: "PENDING", OR: [{ userId }, { email: { equals: user.email ?? "", mode: "insensitive" } }] },
    }),
    prisma.fingerPracticeDay.findMany({ where: { userId, day: { gte: weekStartKey(today), lte: today } }, select: { day: true, seconds: true } }),
    prisma.userBadge.findMany({ where: { userId, earnedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } }, select: { code: true, earnedAt: true } }),
    prisma.scaleProgress.findMany({
      where: { userId, unlockedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) }, scaleGroup: { order: { gt: 0 } } },
      select: { unlockedAt: true, scaleGroup: { select: { slug: true, code: true, title: true } } },
    }),
    prisma.friendRequest.findMany({
      where: { status: "ACCEPTED", OR: [{ senderId: userId }, { receiverId: userId }] },
      select: { senderId: true, receiverId: true },
    }),
  ]);

  const trialDays = (await getBoolSetting("trial.enabled")) ? await getNumberSetting("trial.days") : 0;
  const starting = gettingStartedStep({ kind: entitlement.kind, applicationPending: pendingApplication > 0, trialDays });
  const resolved = resolveNextStep(roadmap);
  const nextStep: NextStep = starting
    ? { ...resolved, ...starting }
    : putFingerPracticeFirst(resolved, {
        required: !isAdmin,
        completedToday: practice.completedToday,
        minutesLeft: Math.max(0, Math.ceil((DAILY_GOAL_SECONDS - practice.todaySeconds) / 60)),
      });

  const current = roadmap.find((s) => s.canAccess && s.status !== "COMPLETED") ?? roadmap.find((s) => s.canAccess) ?? null;

  const friendIds = [...new Set(friendRows.map((r) => (r.senderId === userId ? r.receiverId : r.senderId)))];
  const live =
    friendIds.length > 0
      ? await prisma.fingerPracticeDay.findMany({
          where: { userId: { in: friendIds }, day: today, lastBeatAt: { gte: new Date(now.getTime() - 2 * 60_000) } },
          select: { user: { select: { name: true, username: true } } },
          take: 6,
        })
      : [];

  const wins: Win[] = [
    ...badges.map((b) => {
      const def = BADGES.find((d) => d.code === b.code);
      return { kind: "badge" as const, key: `badge-${b.code}`, title: `New badge: ${def?.label ?? "Badge earned"}`, detail: def?.description ?? "", at: b.earnedAt };
    }),
    ...unlocks.map((u) => ({
      kind: "scale" as const,
      key: `scale-${u.scaleGroup.slug}`,
      title: `${u.scaleGroup.code} is open`,
      detail: `Your teacher opened ${u.scaleGroup.title}.`,
      at: u.unlockedAt ?? now,
    })),
  ];
  if (practice.completedToday && (STREAK_GOALS as readonly number[]).includes(practice.streak)) {
    wins.push({ kind: "streak", key: `streak-${practice.streak}-${today}`, title: `${practice.streak} days in a row`, detail: "You reached a streak goal. Keep it going tomorrow.", at: now });
  }

  return {
    name: profile?.name ?? null,
    isNew: entitlement.kind === "NONE" && !isAdmin,
    nextStep,
    progress: summariseProgress(roadmap),
    currentScale: current ? { code: current.scaleGroup.code, title: current.scaleGroup.title } : null,
    nextClass,
    practice,
    weekMinutes: minutesThisWeek(weekRows, today),
    friendCount: friendIds.length,
    friendsPracticing: live.map((r) => r.user.name?.split(" ")[0] ?? r.user.username ?? "A friend"),
    celebration: pickCelebration(wins, now),
    tip: tipOfTheDay(today),
  };
}
