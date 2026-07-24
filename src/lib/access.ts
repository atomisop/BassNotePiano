import type { Prisma, ProgressStatus, ScaleGroup } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkCourseBadges, recordPracticeActivity } from "@/lib/gamification";

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

/** Minimum score (0-1) to pass a scale's conceptual/spelling quiz. */
export const QUIZ_PASS_THRESHOLD = 0.8;

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
   * "unlocked" — this specific scale was granted individually (legacy
   * per-scale purchase, or an admin override). "curriculum-access" — the
   * blanket $99 purchase bypasses gating entirely. "locked" — neither;
   * there's exactly one way forward now (buy the curriculum), regardless of
   * where this scale sits in the sequence, since per-scale purchase no
   * longer exists.
   */
  reason: "unlocked" | "curriculum-access" | "locked";
  /** Curriculum-access holder skipping ahead of the next-in-line scale — the
   *  roadmap/link should show ProOverrideConfirmModal before navigating here. */
  requiresOverrideConfirm: boolean;
}

/**
 * DB-authoritative roadmap for a user: every scale group's checklist +
 * gating state, in curriculum order. The JWT claims middleware reads are a
 * cache of this same logic for the edge — pages and API routes should call
 * this (not trust the JWT alone) before rendering gated content or
 * accepting a checklist mutation, since the JWT can be briefly stale
 * between payment verification and the next session refresh.
 */
export async function getRoadmap(userId: string): Promise<ScaleAccessState[]> {
  const [user, scaleGroups, progressRows] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { hasCurriculumAccess: true } }),
    prisma.scaleGroup.findMany({ orderBy: { order: "asc" } }),
    prisma.scaleProgress.findMany({ where: { userId } }),
  ]);

  const progressByGroupId = new Map(progressRows.map((p) => [p.scaleGroupId, p]));

  // Still needed even though per-scale purchase is gone — a curriculum-access
  // holder skipping ahead of their own completed scales still gets the
  // "are you sure?" override nudge (a pedagogical prompt, not a payment gate).
  let highestCompletedIndex = -1;
  for (const group of scaleGroups) {
    if (progressByGroupId.get(group.id)?.status === "COMPLETED") {
      highestCompletedIndex = Math.max(highestCompletedIndex, group.order);
    }
  }
  const nextAllowedIndex = highestCompletedIndex + 1;

  return scaleGroups.map((scaleGroup) => {
    const row = progressByGroupId.get(scaleGroup.id);
    const isUnlocked = Boolean(row?.unlockedAt);
    const isOutOfOrder = scaleGroup.order > nextAllowedIndex;

    let canAccess: boolean;
    let reason: ScaleAccessState["reason"];
    let requiresOverrideConfirm = false;

    if (isUnlocked) {
      canAccess = true;
      reason = "unlocked";
    } else if (user.hasCurriculumAccess) {
      canAccess = true;
      reason = "curriculum-access";
      requiresOverrideConfirm = isOutOfOrder;
    } else {
      canAccess = false;
      reason = "locked";
    }

    return {
      scaleGroup,
      status: row?.status ?? "LOCKED",
      moduleRead: row?.moduleRead ?? false,
      practiceCompleted: row?.practiceCompleted ?? false,
      quizPassed: row?.quizPassed ?? false,
      quizScore: row?.quizScore ?? null,
      canAccess,
      reason,
      requiresOverrideConfirm,
    };
  });
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

export async function markPracticeCompleted(userId: string, scaleSlug: string) {
  const { scaleGroup } = await requireAccess(userId, scaleSlug);
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
  const { scaleGroup } = await requireAccess(userId, scaleSlug);
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
export async function unlockScaleForUser(userId: string, scaleSlug: string) {
  const scaleGroup = await prisma.scaleGroup.findUniqueOrThrow({ where: { slug: scaleSlug } });
  const existing = await prisma.scaleProgress.findUnique({
    where: { userId_scaleGroupId: { userId, scaleGroupId: scaleGroup.id } },
  });
  if (existing?.unlockedAt) return existing;

  return prisma.scaleProgress.upsert({
    where: { userId_scaleGroupId: { userId, scaleGroupId: scaleGroup.id } },
    update: { unlockedAt: new Date(), status: "AVAILABLE" },
    create: { userId, scaleGroupId: scaleGroup.id, unlockedAt: new Date(), status: "AVAILABLE" },
  });
}

/** Grants full-curriculum lifetime access. Called once a CURRICULUM payment flips to VERIFIED. */
export async function grantCurriculumAccess(userId: string) {
  return prisma.user.update({
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
