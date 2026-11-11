// Admin > Setup > Data (owner only): everything the app keeps about its students, read in one place. Progress by scale, every
// account's figures side by side, a plain list of what is collected, and the counts the "what could get better" checks read
// (adminInsightsRules.ts). Read only: nothing here changes a row.

import { prisma } from "@/lib/prisma";
import { etDayKey } from "@/lib/fingerPractice";
import { recentDayKeys } from "@/lib/practiceActivityRules";
import { storedToCredits } from "@/lib/classCreditPricing";
import { STALL_DAYS, type InsightInputs, type LessonInsightInput, type ScaleInsightInput } from "@/lib/adminInsightsRules";

const DAY = 86_400_000;

/** Students: every account that is not an admin and not banned. */
const STUDENT = { role: { not: "ADMIN" as const }, bannedAt: null };

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Progress by scale
// ---------------------------------------------------------------------------

export type CellState = "done" | "working" | "open" | "locked";

export interface ScaleReportRow {
  id: string;
  code: string;
  title: string;
  roadmap: string | null;
  /** The checklist funnel: open, module read, practice done, quiz passed (finished). */
  unlocked: number;
  moduleRead: number;
  practiceDone: number;
  completed: number;
  stalled: number;
  avgQuizScore: number | null;
  quizTakers: number;
  quizFirstTryPassed: number;
  medianDaysToFinish: number | null;
  lessons: { id: string; title: string; done: number }[];
}

export interface ScaleReport {
  scales: ScaleReportRow[];
  /** One row per student with any scale open, a cell per scale. */
  grid: { userId: string; name: string; cells: CellState[]; finished: number }[];
}

export async function getScaleReport(): Promise<ScaleReport> {
  const [scales, progress, attempts, lessonDone] = await Promise.all([
    prisma.scaleGroup.findMany({
      orderBy: { order: "asc" },
      select: { id: true, code: true, title: true, roadmap: { select: { name: true } }, lessons: { orderBy: { order: "asc" }, select: { id: true, title: true } } },
    }),
    prisma.scaleProgress.findMany({
      where: { user: STUDENT, OR: [{ unlockedAt: { not: null } }, { status: { not: "LOCKED" } }] },
      select: { userId: true, scaleGroupId: true, status: true, moduleRead: true, practiceCompleted: true, quizPassed: true, unlockedAt: true, completedAt: true, user: { select: { name: true, email: true } } },
    }),
    prisma.quizAttempt.findMany({ where: { user: STUDENT }, orderBy: { attemptedAt: "asc" }, select: { userId: true, scaleGroupId: true, score: true, totalQuestions: true, result: true } }),
    prisma.lessonProgress.groupBy({ by: ["lessonId"], where: { completedAt: { not: null }, user: STUDENT }, _count: { _all: true } }),
  ]);

  const doneByLesson = new Map(lessonDone.map((l) => [l.lessonId, l._count._all]));
  // A roadmap name only tells scales apart when there is more than one roadmap.
  const severalRoadmaps = new Set(scales.map((s) => s.roadmap?.name ?? null)).size > 1;
  const stallBefore = Date.now() - STALL_DAYS * DAY;

  const rows: ScaleReportRow[] = scales.map((scale) => {
    const mine = progress.filter((p) => p.scaleGroupId === scale.id);
    const tries = attempts.filter((a) => a.scaleGroupId === scale.id);
    const firstTry = new Map<string, boolean>();
    for (const a of tries) if (!firstTry.has(a.userId)) firstTry.set(a.userId, a.result === "PASSED");
    const days = mine
      .filter((p) => p.unlockedAt && p.completedAt)
      .map((p) => Math.max(0, ((p.completedAt as Date).getTime() - (p.unlockedAt as Date).getTime()) / DAY));
    return {
      id: scale.id,
      code: scale.code,
      title: scale.title,
      roadmap: severalRoadmaps ? scale.roadmap?.name ?? null : null,
      unlocked: mine.length,
      moduleRead: mine.filter((p) => p.moduleRead).length,
      practiceDone: mine.filter((p) => p.practiceCompleted).length,
      completed: mine.filter((p) => p.status === "COMPLETED").length,
      stalled: mine.filter((p) => p.status !== "COMPLETED" && p.unlockedAt && p.unlockedAt.getTime() < stallBefore).length,
      avgQuizScore: tries.length ? Math.round(tries.reduce((s, a) => s + (a.totalQuestions ? a.score / a.totalQuestions : 0), 0) / tries.length * 100) : null,
      quizTakers: firstTry.size,
      quizFirstTryPassed: [...firstTry.values()].filter(Boolean).length,
      medianDaysToFinish: (() => {
        const m = median(days);
        return m === null ? null : Math.round(m);
      })(),
      lessons: scale.lessons.map((l) => ({ id: l.id, title: l.title, done: doneByLesson.get(l.id) ?? 0 })),
    };
  });

  const byUser = new Map<string, { name: string; states: Map<string, CellState> }>();
  for (const p of progress) {
    const entry = byUser.get(p.userId) ?? { name: p.user.name ?? p.user.email, states: new Map() };
    const state: CellState = p.status === "COMPLETED" ? "done" : p.moduleRead || p.practiceCompleted || p.status === "IN_PROGRESS" ? "working" : "open";
    entry.states.set(p.scaleGroupId, state);
    byUser.set(p.userId, entry);
  }
  const grid = [...byUser.entries()]
    .map(([userId, { name, states }]) => {
      const cells = scales.map((s) => states.get(s.id) ?? "locked");
      return { userId, name, cells, finished: cells.filter((c) => c === "done").length };
    })
    .sort((a, b) => b.finished - a.finished || a.name.localeCompare(b.name));

  return { scales: rows, grid };
}

// ---------------------------------------------------------------------------
// Every student's figures
// ---------------------------------------------------------------------------

export interface PersonRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  phoneVerified: boolean;
  joined: Date;
  lastSeen: Date | null;
  plan: string | null;
  trial: boolean;
  credits: number;
  classesAttended: number;
  noShows: number;
  practiceDays7: number;
  streak: number;
  currentScale: string | null;
  scalesDone: number;
  discord: boolean;
  devices: number;
  atomMessages: number;
  supportThreads: number;
}

export async function getPeopleRows(query: string): Promise<PersonRow[]> {
  const q = query.trim().slice(0, 80);
  const users = await prisma.user.findMany({
    where: { ...STUDENT, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      phoneVerifiedAt: true,
      createdAt: true,
      lastActivityDate: true,
      trialEndsAt: true,
      classCredits: true,
      currentStreak: true,
      discordId: true,
      paymentPlans: { where: { status: "ACTIVE" }, select: { termMonths: true }, take: 1 },
      knownDevices: { select: { lastSeenAt: true } },
      progress: { select: { status: true, unlockedAt: true, scaleGroup: { select: { code: true, order: true } } } },
      _count: { select: { assistantConversation: true } },
    },
  });
  const ids = users.map((u) => u.id);
  const week = recentDayKeys(etDayKey(), 7);
  const [attended, noShows, practice, threads] = await Promise.all([
    prisma.classBooking.groupBy({ by: ["studentId"], where: { studentId: { in: ids }, attendance: "PRESENT" }, _count: { _all: true } }),
    prisma.classBooking.groupBy({ by: ["studentId"], where: { studentId: { in: ids }, attendance: "NO_SHOW" }, _count: { _all: true } }),
    prisma.fingerPracticeDay.groupBy({ by: ["userId"], where: { userId: { in: ids }, day: { in: week }, completedAt: { not: null } }, _count: { _all: true } }),
    prisma.assistantEscalation.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _count: { _all: true } }),
  ]);
  const count = (rows: { _count: { _all: number } }[], key: (r: never) => string | null) => new Map(rows.map((r) => [key(r as never), r._count._all]));
  const attendedBy = count(attended, (r: { studentId: string }) => r.studentId);
  const noShowBy = count(noShows, (r: { studentId: string }) => r.studentId);
  const practiceBy = count(practice, (r: { userId: string }) => r.userId);
  const threadsBy = count(threads, (r: { userId: string | null }) => r.userId);
  const now = Date.now();

  return users.map((u) => {
    const open = u.progress.filter((p) => p.unlockedAt || p.status !== "LOCKED");
    const current = open.filter((p) => p.status !== "COMPLETED").sort((a, b) => a.scaleGroup.order - b.scaleGroup.order)[0];
    const seen = u.knownDevices.reduce<Date | null>((max, d) => (!max || d.lastSeenAt > max ? d.lastSeenAt : max), null) ?? u.lastActivityDate;
    const term = u.paymentPlans[0]?.termMonths;
    return {
      id: u.id,
      name: u.name ?? u.email,
      email: u.email,
      phone: u.phone,
      phoneVerified: Boolean(u.phoneVerifiedAt),
      joined: u.createdAt,
      lastSeen: seen,
      plan: term ? `${term} ${term === 1 ? "month" : "months"}` : null,
      trial: Boolean(u.trialEndsAt && u.trialEndsAt.getTime() > now),
      credits: storedToCredits(u.classCredits),
      classesAttended: attendedBy.get(u.id) ?? 0,
      noShows: noShowBy.get(u.id) ?? 0,
      practiceDays7: practiceBy.get(u.id) ?? 0,
      streak: u.currentStreak,
      currentScale: current?.scaleGroup.code ?? null,
      scalesDone: open.filter((p) => p.status === "COMPLETED").length,
      discord: Boolean(u.discordId),
      devices: u.knownDevices.length,
      atomMessages: u._count.assistantConversation,
      supportThreads: threadsBy.get(u.id) ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// What is collected
// ---------------------------------------------------------------------------

export interface CollectedItem {
  what: string;
  detail: string;
  rows: number;
  kept?: string;
}

export interface CollectedGroup {
  title: string;
  items: CollectedItem[];
}

export async function getCollectedInventory(): Promise<CollectedGroup[]> {
  const [
    users,
    phones,
    devices,
    scaleRows,
    lessonRows,
    quizRows,
    notes,
    practiceDays,
    bookings,
    plans,
    payments,
    messages,
    groupMessages,
    atomMessages,
    atomRatings,
    supportMessages,
    notifications,
    emails,
    pushes,
    visits,
    referrals,
    parentLinks,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { phone: { not: null } } }),
    prisma.knownDevice.count(),
    prisma.scaleProgress.count(),
    prisma.lessonProgress.count(),
    prisma.quizAttempt.count(),
    prisma.scaleNote.count(),
    prisma.fingerPracticeDay.count(),
    prisma.classBooking.count(),
    prisma.paymentPlan.count(),
    prisma.zellePayment.count(),
    prisma.message.count(),
    prisma.groupMessage.count(),
    prisma.assistantConversationMessage.count(),
    prisma.assistantFeedback.count(),
    prisma.supportMessage.count(),
    prisma.notification.count(),
    prisma.emailLog.count(),
    prisma.pushSubscription.count(),
    prisma.pageHit.aggregate({ _sum: { count: true } }),
    prisma.referral.count(),
    prisma.parentLink.count(),
  ]);

  return [
    {
      title: "Who they are",
      items: [
        { what: "Accounts", detail: "Name, email, username, photo, instrument and skill level, when they joined, notification switches", rows: users },
        { what: "Phone numbers", detail: "As typed, and whether a text code confirmed it", rows: phones },
        { what: "Signed-in devices", detail: "Browser and system, city, region and country from the host, first and last seen. Never the IP address", rows: devices },
        { what: "Family and parent links", detail: "Who pays for whom, and who manages a child's schedule", rows: parentLinks },
        { what: "Referrals", detail: "Who invited whom, and whether the reward was given", rows: referrals },
      ],
    },
    {
      title: "Learning",
      items: [
        { what: "Scale progress", detail: "Per scale: open, module read, practice done, quiz passed and score, unlock and finish dates", rows: scaleRows },
        { what: "Lessons finished", detail: "Which lesson files each student finished, and when", rows: lessonRows },
        { what: "Quiz attempts", detail: "Every try: score, pass or fail, and each answer", rows: quizRows },
        { what: "Scale notes", detail: "Notes students write on a scale", rows: notes },
        { what: "Daily practice", detail: "Seconds practiced each day (Eastern time) and the day it reached 10 minutes", rows: practiceDays },
      ],
    },
    {
      title: "Classes and money",
      items: [
        { what: "Class bookings", detail: "Every booked class: time, credits, canceled or held, attended or no-show", rows: bookings },
        { what: "Payment plans", detail: "Plan length, price, payments made, next bill, pauses and cancellations with the reason given", rows: plans },
        { what: "Payments", detail: "Amount, reference code, method, the phone typed at payment, how the bank email matched it", rows: payments },
      ],
    },
    {
      title: "Messages and help",
      items: [
        { what: "Direct messages", detail: "One to one chats between friends, with reactions and read times", rows: messages },
        { what: "Group messages", detail: "Group chats and their members", rows: groupMessages },
        { what: "Atom chats", detail: "A signed-in student's conversations with Atom", rows: atomMessages, kept: "Deleted after 30 days" },
        { what: "Atom ratings", detail: "Thumbs up or down on an answer, with that answer's text", rows: atomRatings },
        { what: "Support and email threads", detail: "Chats handed to a person and emails to music@", rows: supportMessages },
      ],
    },
    {
      title: "What the app sends and sees",
      items: [
        { what: "Notifications", detail: "Every bell notice and whether it was read", rows: notifications },
        { what: "Email record", detail: "Address, subject and delivery status of every email. Never the body", rows: emails, kept: "Deleted after 180 days" },
        { what: "Push subscriptions", detail: "One per browser that turned on phone reminders", rows: pushes },
        { what: "Page visits", detail: "A count per page per day, with no names attached", rows: visits._sum.count ?? 0 },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Counts for the "what could get better" checks
// ---------------------------------------------------------------------------

export async function getInsightInputs(report: ScaleReport): Promise<InsightInputs> {
  const since30 = new Date(Date.now() - 30 * DAY);
  const since90 = new Date(Date.now() - 90 * DAY);
  const today = etDayKey();
  const last14 = recentDayKeys(today, 14);
  const thisWeek = last14.slice(-7);
  const lastWeek = last14.slice(0, 7);

  const [learners, practiced, bookings, ratings, handoffs, trials, activePlans] = await Promise.all([
    prisma.user.findMany({
      where: { ...STUDENT, OR: [{ paymentPlans: { some: { status: "ACTIVE" } } }, { hasCurriculumAccess: true }, { trialEndsAt: { gt: new Date() } }] },
      select: { id: true },
    }),
    prisma.fingerPracticeDay.findMany({ where: { day: { in: last14 }, completedAt: { not: null }, user: STUDENT }, select: { userId: true, day: true } }),
    prisma.classBooking.findMany({ where: { scheduledAt: { gte: since30, lte: new Date() }, student: STUDENT }, select: { status: true, attendance: true, canceledReason: true } }),
    prisma.assistantFeedback.groupBy({ by: ["rating"], where: { createdAt: { gte: since30 } }, _count: { _all: true } }),
    prisma.assistantEscalation.count({ where: { createdAt: { gte: since30 }, source: "CHAT" } }),
    prisma.user.findMany({
      where: { ...STUDENT, trialEndsAt: { gte: since90 } },
      select: { trialEndsAt: true, paymentPlans: { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 } },
    }),
    prisma.paymentPlan.findMany({ where: { status: "ACTIVE", user: STUDENT }, select: { nextDueDate: true, pauseUntil: true, installmentAmountCents: true } }),
  ]);

  const learnerIds = new Set(learners.map((l) => l.id));
  const practicedIn = (days: string[]) => new Set(practiced.filter((p) => learnerIds.has(p.userId) && days.includes(p.day)).map((p) => p.userId)).size;
  const held = bookings.filter((b) => b.status !== "CANCELED");
  const rated = new Map(ratings.map((r) => [r.rating, r._count._all]));
  const now = Date.now();

  const scales: ScaleInsightInput[] = report.scales.map((s) => ({
    code: s.code,
    title: s.title,
    href: "/admin/data?tab=scales",
    unlocked: s.unlocked,
    completed: s.completed,
    stalled: s.stalled,
    quizTakers: s.quizTakers,
    quizFirstTryPassed: s.quizFirstTryPassed,
  }));
  const lessons: LessonInsightInput[] = report.scales.flatMap((s) => {
    const best = Math.max(0, ...s.lessons.map((l) => l.done));
    return s.lessons.map((l) => ({ scaleCode: s.code, title: l.title, reach: s.unlocked, done: l.done, bestDone: best }));
  });

  return {
    scales,
    lessons,
    practice: { learners: learnerIds.size, practicedThisWeek: practicedIn(thisWeek), practicedLastWeek: practicedIn(lastWeek) },
    classes: {
      held: held.length,
      present: held.filter((b) => b.attendance === "PRESENT").length,
      noShow: held.filter((b) => b.attendance === "NO_SHOW").length,
      unmarked: held.filter((b) => b.attendance === null).length,
      // A class the student (or the admin) canceled carries no reason; pauses and bans write one, and are not counted here.
      canceledByStudent: bookings.filter((b) => b.status === "CANCELED" && b.canceledReason === null).length,
    },
    atom: { up: rated.get("UP") ?? 0, down: rated.get("DOWN") ?? 0, handoffs },
    trials: {
      started: trials.length,
      startedPlan: trials.filter((t) => t.paymentPlans[0] && t.trialEndsAt && t.paymentPlans[0].createdAt.getTime() >= t.trialEndsAt.getTime() - 4 * DAY).length,
    },
    plans: {
      active: activePlans.length,
      overdue: activePlans.filter((p) => p.installmentAmountCents > 0 && p.nextDueDate.getTime() < now && !(p.pauseUntil && p.pauseUntil.getTime() > now)).length,
    },
  };
}
