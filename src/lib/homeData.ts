import type { BadgeCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRoadmap } from "@/lib/access";
import { getCurriculumEntitlement } from "@/lib/entitlement";
import { DAILY_GOAL_SECONDS, etDayKey, getFingerPracticeStatusOnce, type FingerPracticeStatus } from "@/lib/fingerPractice";
import { putFingerPracticeFirst, resolveNextStep, summariseProgress, type NextStep } from "@/lib/next-step";
import { gettingStartedStep } from "@/lib/lockedScale";
import { getBoolSetting, getNumberSetting } from "@/lib/siteSettings";
import { BADGES } from "@/lib/badges";
import { STREAK_GOALS } from "@/lib/streakRules";
import { minutesThisWeek, pickCelebration, weekDayMinutes, weekDayIndex, tipOfTheDay, weekStartKey, type Win } from "@/lib/homeRules";
import { roadmapsForViewer } from "@/lib/roadmaps";
import { storedToCredits } from "@/lib/classCreditPricing";
import { FIRST_ROADMAP_ID, summarizeRoadmaps } from "@/lib/roadmapRules";
import { claimParentInvites, listLinkedChildren, listLinksToChild } from "@/lib/parentLinks";
import { getTrialApplyFacts, type TrialApplyFacts } from "@/lib/trialApplication";
import { claimFriendEmailAsks } from "@/lib/social";

/** One child a parent manages, as a Home row: the next class and this week's practice, one tap into their page. */
export interface HomeChild {
  id: string;
  name: string;
  nextClass: Date | null;
  weekMinutes: number;
}

export interface HomeData {
  name: string | null;
  /** No plan and no trial yet (and not the admin): Home shows the free trial welcome instead of the student cards. */
  isNew: boolean;
  /** Children this person manages in parent mode (accepted links). A parent who only pays for them is shown them, not a trial pitch. */
  children: HomeChild[];
  /** Parents asking to link to this account, answered right on Home. */
  parentRequests: { linkId: string; parentName: string }[];
  /** Set when Home can send a free trial class request from the account in place (what is still missing is asked there). */
  trialApply: TrialApplyFacts | null;
  nextStep: NextStep;
  /** Progress through the roadmap the student is on now. */
  progress: ReturnType<typeof summariseProgress>;
  /** The roadmap the student is on now, for the picture card. */
  roadmap: { name: string; artwork: string };
  /** The scale the student is on now, for the roadmap card. */
  currentScale: { code: string; title: string } | null;
  nextClass: { scheduledAt: Date; creditsSpent: number; discordChannelId: string | null; inPerson: boolean } | null;
  practice: FingerPracticeStatus;
  weekMinutes: number;
  /** Minutes on each day of this week, Sunday first. */
  weekDays: number[];
  /** The current roadmap's scales in order, for Home's path shelf. */
  path: { slug: string; code: string; title: string; done: boolean; open: boolean; current: boolean }[];
  /** Today's place in `weekDays`. */
  todayIndex: number;
  friendCount: number;
  /** First names of friends practicing right now. */
  friendsPracticing: string[];
  celebration: Win | null;
  tip: { title: string; body: string };
  /** First-week checklist: Discord linked, a class booked, the first practice done. Empty once all three are done, and for the admin. */
  gettingStarted: { done: boolean; label: string; detail: string; href: string; external: boolean }[];
  badgeCount: number;
  /** Every badge the student has earned, for the Badges card. */
  earnedBadgeCodes: BadgeCode[];
  /** Credits on the account, in 45 minute classes. */
  credits: number;
}

/** Everything the Home screen shows, in one round of queries. */
export async function getHomeData(user: { id: string; role: string; email: string | null }): Promise<HomeData> {
  const userId = user.id;
  const now = new Date();
  const today = etDayKey(now);
  const isAdmin = user.role === "ADMIN";
  // A parent's request made before this account existed reaches it here, on the first Home visit after the email is confirmed.
  await claimParentInvites(userId, user.email).catch((err) => console.error("Claiming parent requests failed (non-blocking):", err));
  await claimFriendEmailAsks(userId, user.email).catch((err) => console.error("Claiming book-together asks failed (non-blocking):", err));

  const [roadmap, roadmapList, profile, practice, nextClass, entitlement, pendingApplication, weekRows, badges, unlocks, friendRows, linkedChildren, toMe] = await Promise.all([
    getRoadmap(userId),
    roadmapsForViewer(isAdmin),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, discordId: true, classCredits: true, trialEndsAt: true } }),
    getFingerPracticeStatusOnce(userId),
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
    isAdmin ? Promise.resolve([]) : listLinkedChildren(userId),
    isAdmin ? Promise.resolve({ requests: [], parents: [] }) : listLinksToChild(userId),
  ]);
  const children = await childRows(linkedChildren, today, now);
  const [everBooked, everPracticed, earnedBadges] = await Promise.all([
    prisma.classBooking.count({ where: { studentId: userId } }),
    prisma.fingerPracticeDay.count({ where: { userId, completedAt: { not: null } } }),
    prisma.userBadge.findMany({ where: { userId }, select: { code: true } }),
  ]);
  const checklist = [
    { done: Boolean(profile?.discordId), label: "Link your Discord", detail: "Your live class call opens there.", href: "/api/discord/connect", external: true },
    { done: everBooked > 0, label: "Book your first class", detail: "Pick a time that repeats every week.", href: "/lessons", external: false },
    { done: everPracticed > 0, label: "Do your first 10 minutes of practice", detail: "It also opens your scales.", href: "/practice", external: false },
  ];
  const showChecklist = !isAdmin && entitlement.kind !== "NONE" && checklist.some((c) => !c.done);

  const trialDays = (await getBoolSetting("trial.enabled")) ? await getNumberSetting("trial.days") : 0;
  const starting = gettingStartedStep({
    kind: entitlement.kind,
    applicationPending: pendingApplication > 0,
    trialDays,
    trialUsed: Boolean(profile?.trialEndsAt),
    children: children.length,
  });
  // The free trial pitch is the one Home answers in place: only when that is the step it shows.
  const trialApply = !isAdmin && starting?.href === "/classes" ? await getTrialApplyFacts(userId) : null;
  const resolved = resolveNextStep(roadmap);
  const nextStep: NextStep = starting
    ? { ...resolved, ...starting }
    : putFingerPracticeFirst(resolved, {
        required: !isAdmin,
        completedToday: practice.completedToday,
        minutesLeft: Math.max(0, Math.ceil((DAILY_GOAL_SECONDS - practice.todaySeconds) / 60)),
      });

  const { currentId } = summarizeRoadmaps(
    roadmapList,
    roadmap.map((s) => ({ roadmapId: s.scaleGroup.roadmapId, status: s.status, canAccess: s.canAccess })),
  );
  const currentRoadmap = roadmapList.find((r) => r.id === currentId) ?? roadmapList[0] ?? null;
  const inCurrent = currentRoadmap ? roadmap.filter((s) => (s.scaleGroup.roadmapId ?? FIRST_ROADMAP_ID) === currentRoadmap.id) : roadmap;
  const current = inCurrent.find((s) => s.canAccess && s.status !== "COMPLETED") ?? inCurrent.find((s) => s.canAccess) ?? inCurrent[0] ?? null;

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
    children,
    parentRequests: toMe.requests,
    trialApply,
    nextStep,
    progress: summariseProgress(inCurrent),
    roadmap: { name: currentRoadmap?.name ?? "Scales", artwork: currentRoadmap?.artwork ?? "dusk" },
    currentScale: current ? { code: current.scaleGroup.code, title: current.scaleGroup.title } : null,
    nextClass,
    practice,
    weekMinutes: minutesThisWeek(weekRows, today),
    weekDays: weekDayMinutes(weekRows, today),
    path: inCurrent.map((s) => ({
      slug: s.scaleGroup.slug,
      code: s.scaleGroup.code,
      title: s.scaleGroup.title,
      done: s.status === "COMPLETED",
      open: s.canAccess,
      current: !!current && s.scaleGroup.slug === current.scaleGroup.slug,
    })),
    todayIndex: weekDayIndex(today),
    friendCount: friendIds.length,
    friendsPracticing: live.map((r) => r.user.name?.split(" ")[0] ?? r.user.username ?? "A friend"),
    celebration: pickCelebration(wins, now),
    tip: tipOfTheDay(today),
    gettingStarted: showChecklist ? checklist : [],
    badgeCount: earnedBadges.length,
    earnedBadgeCodes: earnedBadges.map((b) => b.code),
    credits: storedToCredits(profile?.classCredits ?? 0),
  };
}

/** Each managed child's next class and this week's practice minutes, in two queries for all of them. */
async function childRows(kids: { id: string; name: string }[], today: string, now: Date): Promise<HomeChild[]> {
  if (kids.length === 0) return [];
  const ids = kids.map((k) => k.id);
  const [classes, practice] = await Promise.all([
    prisma.classBooking.findMany({
      where: { studentId: { in: ids }, status: "SCHEDULED", scheduledAt: { gt: now } },
      orderBy: { scheduledAt: "asc" },
      distinct: ["studentId"],
      select: { studentId: true, scheduledAt: true },
    }),
    prisma.fingerPracticeDay.findMany({ where: { userId: { in: ids }, day: { gte: weekStartKey(today), lte: today } }, select: { userId: true, day: true, seconds: true } }),
  ]);
  return kids.map((k) => ({
    id: k.id,
    name: k.name,
    nextClass: classes.find((c) => c.studentId === k.id)?.scheduledAt ?? null,
    weekMinutes: minutesThisWeek(practice.filter((p) => p.userId === k.id), today),
  }));
}
