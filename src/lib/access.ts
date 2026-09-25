import type { Prisma, ProgressStatus, ScaleGroup } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkCourseBadges, recordPracticeActivity } from "@/lib/gamification";
import { getLessonCompletionSummary } from "@/lib/courseContent";
import { QUIZ_PASS_THRESHOLD } from "@/lib/curriculum";
import { getCurriculumEntitlement } from "@/lib/entitlement";
import { isFullAccess, TRIAL_SCALE_SLUG, type CurriculumAccessKind } from "@/lib/entitlementRules";

// Badge/streak bookkeeping is a best-effort side effect — a hiccup here
// should never fail the actual checklist mutation the student is waiting on.
async function trackGamification(userId: string, justCompleted: boolean) {
  try {
    await recordPracticeActivity(userId);
    if (justCompleted) await checkCourseBadges(userId);
  } catch (err) {
    console.error("Gamification tracking failed (non-blocking):", err);
  }
}

// Lives in curriculum.ts so client components can read it without pulling
// this server-only module (and its email/DB dependencies) into the browser.
export { QUIZ_PASS_THRESHOLD } from "@/lib/curriculum";

export class AccessDeniedError extends Error {}

export interface ScaleAccessState {
  scaleGroup: ScaleGroup;
  status: ProgressStatus;
  moduleRead: boolean;
  practiceCompleted: boolean;
  quizPassed: boolean;
  quizScore: number | null;
  canAccess: boolean;
  /**
   * "unlocked": the teacher approved this scale for the student (or it's
   * their first scale, open the moment they have a plan). "curriculum-access":
   * an admin browsing everything. "trial": the fixed free-trial slice.
   * "locked": not reachable right now, see `lockedBecause` for which kind.
   */
  reason: "unlocked" | "curriculum-access" | "trial" | "locked";
  /**
   * Only set when locked. "no-plan": the student has no live-class access
   * (never had a plan, or it lapsed), so the way forward is a Payment Plan.
   * "not-yet-approved": they're a paying student and this scale simply
   * hasn't been released by their teacher yet.
   */
  lockedBecause: "no-plan" | "not-yet-approved" | null;
}

/**
 * DB-authoritative roadmap for a user: every scale group's checklist +
 * gating state, in curriculum order. The JWT claims middleware reads are a
 * coarse cache (is access active at all); pages and API routes should call
 * this before rendering gated content or accepting a checklist mutation,
 * since it also knows which individual scales the teacher has approved.
 */
export async function getRoadmap(userId: string): Promise<ScaleAccessState[]> {
  const [entitlement, scaleGroups, progressRows] = await Promise.all([
    getCurriculumEntitlement(userId),
    prisma.scaleGroup.findMany({ orderBy: { order: "asc" } }),
    prisma.scaleProgress.findMany({ where: { userId } }),
  ]);

  const progressByGroupId = new Map(progressRows.map((p) => [p.scaleGroupId, p]));

  return scaleGroups.map((scaleGroup) => {
    const row = progressByGroupId.get(scaleGroup.id);
    const { canAccess, reason, lockedBecause } = decideScaleAccess(entitlement.kind, scaleGroup, {
      approved: Boolean(row?.unlockedAt),
    });

    return {
      scaleGroup,
      status: row?.status ?? "LOCKED",
      moduleRead: row?.moduleRead ?? false,
      practiceCompleted: row?.practiceCompleted ?? false,
      quizPassed: row?.quizPassed ?? false,
      quizScore: row?.quizScore ?? null,
      canAccess,
      reason,
      lockedBecause,
    };
  });
}

/**
 * The single rule for "can this access kind open this scale." Full access
 * opens the first scale automatically and every later one only after the
 * teacher approved it (ScaleProgress.unlockedAt). A trial opens exactly the
 * first scale (its lesson-level cap is applied where lessons are listed).
 * No access opens nothing, whatever unlockedAt rows are left over from
 * before, which is what makes a lapsed plan close everything at once.
 */
export function decideScaleAccess(
  kind: CurriculumAccessKind,
  scaleGroup: Pick<ScaleGroup, "slug" | "order">,
  progress: { approved: boolean },
): Pick<ScaleAccessState, "canAccess" | "reason" | "lockedBecause"> {
  if (kind === "ADMIN") return { canAccess: true, reason: "curriculum-access", lockedBecause: null };
  if (kind === "TRIAL") {
    return scaleGroup.slug === TRIAL_SCALE_SLUG
      ? { canAccess: true, reason: "trial", lockedBecause: null }
      : { canAccess: false, reason: "locked", lockedBecause: "no-plan" };
  }
  if (isFullAccess(kind)) {
    if (scaleGroup.order === 0 || progress.approved) return { canAccess: true, reason: "unlocked", lockedBecause: null };
    return { canAccess: false, reason: "locked", lockedBecause: "not-yet-approved" };
  }
  return { canAccess: false, reason: "locked", lockedBecause: "no-plan" };
}

export async function canAccessScale(userId: string, scaleSlug: string): Promise<ScaleAccessState | null> {
  const roadmap = await getRoadmap(userId);
  return roadmap.find((s) => s.scaleGroup.slug === scaleSlug) ?? null;
}

async function requireAccess(userId: string, scaleSlug: string): Promise<ScaleAccessState> {
  const access = await canAccessScale(userId, scaleSlug);
  if (!access || !access.canAccess) {
    throw new AccessDeniedError(`User ${userId} does not currently have access to "${scaleSlug}"`);
  }
  return access;
}

/**
 * The trial only opens a slice of one scale for reading and watching. Practice
 * logs and quiz attempts are what advance a student toward the next scale, so
 * they're reserved for paying students.
 */
async function requireFullAccess(userId: string, scaleSlug: string): Promise<ScaleAccessState> {
  const access = await requireAccess(userId, scaleSlug);
  if (access.reason === "trial") {
    throw new AccessDeniedError(`User ${userId} is on the free trial, which doesn't include practice or quizzes`);
  }
  return access;
}

// ---------------------------------------------------------------------------
// Checklist mutations — (a) module read, (b) practice completed, (c) quiz
// ---------------------------------------------------------------------------

/** Recomputes status from the three checklist booleans; stamps completedAt once, on first completion. */
async function syncProgressStatus(progressId: string) {
  const row = await prisma.scaleProgress.findUniqueOrThrow({ where: { id: progressId } });
  const allDone = row.moduleRead && row.practiceCompleted && row.quizPassed;
  const anyStarted = row.moduleRead || row.practiceCompleted || row.quizPassed;
  const status: ProgressStatus = allDone ? "COMPLETED" : anyStarted ? "IN_PROGRESS" : "AVAILABLE";

  if (status === row.status && (status !== "COMPLETED" || row.completedAt)) return row;

  return prisma.scaleProgress.update({
    where: { id: progressId },
    data: { status, completedAt: status === "COMPLETED" ? (row.completedAt ?? new Date()) : row.completedAt },
  });
}

export async function markModuleRead(userId: string, scaleSlug: string) {
  const { scaleGroup } = await requireAccess(userId, scaleSlug);
  const row = await prisma.scaleProgress.upsert({
    where: { userId_scaleGroupId: { userId, scaleGroupId: scaleGroup.id } },
    update: { moduleRead: true, moduleReadAt: new Date() },
    create: {
      userId,
      scaleGroupId: scaleGroup.id,
      unlockedAt: new Date(), // covers Pro members who never had an explicit unlock row
      moduleRead: true,
      moduleReadAt: new Date(),
    },
  });
  const synced = await syncProgressStatus(row.id);
  await trackGamification(userId, row.status !== "COMPLETED" && synced.status === "COMPLETED");
  return synced;
}

/**
 * Course-player equivalent of clicking the old manual "Mark module as
 * read" button — call this after markLessonComplete() on the course-content
 * side. No-ops until every uploaded Lesson for the scale group has a
 * LessonProgress row for this user (a scale with zero lessons uploaded yet
 * never silently completes). Reuses markModuleRead itself rather than
 * duplicating its upsert/status-sync/gamification logic.
 */
export async function syncLessonCompletionToModuleRead(userId: string, scaleSlug: string) {
  const summary = await getLessonCompletionSummary(userId, scaleSlug);
  if (!summary.allComplete) return null;
  return markModuleRead(userId, scaleSlug);
}

export async function markPracticeCompleted(userId: string, scaleSlug: string) {
  const { scaleGroup } = await requireFullAccess(userId, scaleSlug);
  const row = await prisma.scaleProgress.upsert({
    where: { userId_scaleGroupId: { userId, scaleGroupId: scaleGroup.id } },
    update: { practiceCompleted: true, practiceCompletedAt: new Date() },
    create: {
      userId,
      scaleGroupId: scaleGroup.id,
      unlockedAt: new Date(),
      practiceCompleted: true,
      practiceCompletedAt: new Date(),
    },
  });
  const synced = await syncProgressStatus(row.id);
  await trackGamification(userId, row.status !== "COMPLETED" && synced.status === "COMPLETED");
  return synced;
}

export interface QuizSubmission {
  score: number;
  totalQuestions: number;
  answers: Prisma.InputJsonValue;
}

/**
 * Records a quiz attempt and, if it passes, ticks the checklist's quiz item.
 * Passing the final item of a scale's checklist intentionally does NOT
 * unlock the next scale — nothing here touches the next ScaleGroup's
 * ScaleProgress row. The next scale only becomes reachable once the student
 * has curriculum access (or, for legacy accounts, an existing per-scale
 * unlock from before Pay-As-You-Go was retired).
 */
export async function recordQuizAttempt(userId: string, scaleSlug: string, submission: QuizSubmission) {
  const { scaleGroup } = await requireFullAccess(userId, scaleSlug);
  const passed = submission.score / submission.totalQuestions >= QUIZ_PASS_THRESHOLD;

  await prisma.quizAttempt.create({
    data: {
      userId,
      scaleGroupId: scaleGroup.id,
      score: submission.score,
      totalQuestions: submission.totalQuestions,
      result: passed ? "PASSED" : "FAILED",
      answers: submission.answers,
    },
  });

  const row = await prisma.scaleProgress.upsert({
    where: { userId_scaleGroupId: { userId, scaleGroupId: scaleGroup.id } },
    update: passed
      ? { quizPassed: true, quizScore: submission.score, quizPassedAt: new Date() }
      : { quizScore: submission.score },
    create: {
      userId,
      scaleGroupId: scaleGroup.id,
      unlockedAt: new Date(),
      quizPassed: passed,
      quizScore: submission.score,
      quizPassedAt: passed ? new Date() : null,
    },
  });

  const synced = await syncProgressStatus(row.id);
  await trackGamification(userId, row.status !== "COMPLETED" && synced.status === "COMPLETED");
  return { passed, progress: synced };
}

// ---------------------------------------------------------------------------
// Unlocking — legacy per-scale grants, curriculum access, admin overrides
// ---------------------------------------------------------------------------

/**
 * Grants access to one scale. Idempotent — if it's already unlocked, the
 * original unlockedAt is kept. Retained for legacy SCALE_UNLOCK payments
 * (no longer purchasable, but old pending rows can still resolve through
 * this) and admin manual-override grants.
 */
// STEP 19: both functions below now take an optional `db` — the plain
// `prisma` client by default (every existing call site keeps working
// unchanged), or a `Prisma.TransactionClient` when the caller needs this
// write to commit atomically alongside another one. approveZellePayment is
// exactly that caller: see its own comment for why the payment-status flip
// and the entitlement grant have to succeed or fail together.
export async function unlockScaleForUser(
  userId: string,
  scaleSlug: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const scaleGroup = await db.scaleGroup.findUniqueOrThrow({ where: { slug: scaleSlug } });
  const existing = await db.scaleProgress.findUnique({
    where: { userId_scaleGroupId: { userId, scaleGroupId: scaleGroup.id } },
  });
  if (existing?.unlockedAt) return existing;

  return db.scaleProgress.upsert({
    where: { userId_scaleGroupId: { userId, scaleGroupId: scaleGroup.id } },
    update: { unlockedAt: new Date(), status: "AVAILABLE" },
    create: { userId, scaleGroupId: scaleGroup.id, unlockedAt: new Date(), status: "AVAILABLE" },
  });
}

/**
 * Grants complimentary full-curriculum access (the admin Grant button).
 * Also still called for a legacy CURRICULUM payment that resolves late, but
 * the curriculum is no longer purchasable on its own.
 */
export async function grantCurriculumAccess(userId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  return db.user.update({
    where: { id: userId },
    data: { hasCurriculumAccess: true, curriculumUnlockedAt: new Date() },
  });
}

/**
 * Admin-only counterpart to unlockScaleForUser — revokes access to one
 * scale. Deliberately doesn't touch the checklist booleans or quiz history;
 * it severs access without erasing what the student already did, since this
 * is meant for correcting a mistaken unlock, not punitive resets. Also
 * doesn't re-lock later scales that may have been unlocked off of this
 * one's completion — it's a surgical override, not a full chain re-sync.
 */
export async function lockScaleForUser(userId: string, scaleSlug: string) {
  const scaleGroup = await prisma.scaleGroup.findUniqueOrThrow({ where: { slug: scaleSlug } });
  return prisma.scaleProgress.updateMany({
    where: { userId, scaleGroupId: scaleGroup.id },
    data: { unlockedAt: null, status: "LOCKED" },
  });
}

/** Admin-only counterpart to grantCurriculumAccess — revokes lifetime access. */
export async function revokeCurriculumAccess(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { hasCurriculumAccess: false, curriculumUnlockedAt: null },
  });
}
