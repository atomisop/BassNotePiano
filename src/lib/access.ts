import type { Prisma, ProgressStatus, ScaleGroup } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
  reason: "unlocked" | "pro-bypass" | "requires-payment" | "locked";
  /** Pro member skipping ahead of the next-in-line scale — the roadmap/link
   *  should show ProOverrideConfirmModal before navigating here. */
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
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { isProMember: true } }),
    prisma.scaleGroup.findMany({ orderBy: { order: "asc" } }),
    prisma.scaleProgress.findMany({ where: { userId } }),
  ]);

  const progressByGroupId = new Map(progressRows.map((p) => [p.scaleGroupId, p]));

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
    const isSequentialNext = scaleGroup.order === nextAllowedIndex;
    const isOutOfOrder = scaleGroup.order > nextAllowedIndex;

    let canAccess: boolean;
    let reason: ScaleAccessState["reason"];
    let requiresOverrideConfirm = false;

    if (isUnlocked) {
      canAccess = true;
      reason = "unlocked";
    } else if (user.isProMember) {
      canAccess = true;
      reason = "pro-bypass";
      requiresOverrideConfirm = isOutOfOrder;
    } else if (isSequentialNext) {
      canAccess = false;
      reason = "requires-payment";
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
  return syncProgressStatus(row.id);
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
  return syncProgressStatus(row.id);
}

export interface QuizSubmission {
  score: number;
  totalQuestions: number;
  answers: Prisma.InputJsonValue;
}

/**
 * Records a quiz attempt and, if it passes, ticks the checklist's quiz item.
 * Passing the final item of a Pay-As-You-Go scale's checklist intentionally
 * does NOT unlock the next scale — nothing here touches the next
 * ScaleGroup's ScaleProgress row, which is exactly the "freeze the routing
 * pathway" behavior the paid tier requires. The next scale only becomes
 * reachable once a ZellePayment for it is verified (unlockScaleForUser).
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

  return { passed, progress: await syncProgressStatus(row.id) };
}

// ---------------------------------------------------------------------------
// Unlocking — Zelle-verified $25 sessions, Pro overrides, admin grants
// ---------------------------------------------------------------------------

/**
 * Grants access to one scale. Idempotent — if it's already unlocked, the
 * original unlockedAt is kept. Called from the Zelle verification route
 * once a SCALE_UNLOCK payment flips to VERIFIED, and from the Pro
 * out-of-order override confirmation flow.
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

/** Grants full-platform lifetime access. Called once a PRO_LIFETIME payment flips to VERIFIED. */
export async function grantProLifetime(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { isProMember: true, proUnlockedAt: new Date() },
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

/** Admin-only counterpart to grantProLifetime — revokes lifetime access. */
export async function revokeProLifetime(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { isProMember: false, proUnlockedAt: null },
  });
}

/** The next scale a non-Pro student needs to pay for, or null if none (all unlocked, or user is Pro). */
export async function getNextUnlockableScale(userId: string): Promise<ScaleGroup | null> {
  const roadmap = await getRoadmap(userId);
  return roadmap.find((s) => s.reason === "requires-payment")?.scaleGroup ?? null;
}
