import { prisma } from "@/lib/prisma";
import { unlockScaleForUser } from "@/lib/access";
import { getCurriculumEntitlement } from "@/lib/entitlement";
import { computeNextApproval, isFullAccess, type ApprovalScaleState, type NextApproval } from "@/lib/entitlementRules";
import { createNotification } from "@/lib/notifications";

export class ScaleApprovalError extends Error {}

/** The student's scale-by-scale state in the shape computeNextApproval reads. */
export async function loadApprovalStates(userId: string): Promise<ApprovalScaleState[]> {
  const [scaleGroups, rows] = await Promise.all([
    prisma.scaleGroup.findMany({ orderBy: { order: "asc" }, select: { id: true, slug: true, order: true } }),
    prisma.scaleProgress.findMany({ where: { userId }, select: { scaleGroupId: true, status: true, unlockedAt: true } }),
  ]);
  const byGroup = new Map(rows.map((r) => [r.scaleGroupId, r]));
  return scaleGroups.map((sg) => {
    const row = byGroup.get(sg.id);
    return {
      slug: sg.slug,
      order: sg.order,
      status: row?.status ?? "LOCKED",
      unlockedAt: row?.unlockedAt ? row.unlockedAt.getTime() : null,
    };
  });
}

export async function getNextApproval(userId: string): Promise<NextApproval> {
  return computeNextApproval(await loadApprovalStates(userId), Date.now());
}

/**
 * The teacher's "release the next scale" action. Always releases the
 * student's actual next scale, never an arbitrary one, so an approval can't
 * skip ahead by accident. `force` lets the teacher go past the two automatic
 * rules (previous scale's checklist, one scale per week) for a fast learner,
 * but never past the payment requirement.
 */
export async function approveNextScale(userId: string, opts: { force?: boolean } = {}) {
  const entitlement = await getCurriculumEntitlement(userId);
  if (!isFullAccess(entitlement.kind) || entitlement.kind === "ADMIN") {
    throw new ScaleApprovalError("This student doesn't have an active plan, so there's nothing to release yet.");
  }

  const next = await getNextApproval(userId);
  if (next.state === "ALL_UNLOCKED") throw new ScaleApprovalError("Every scale is already unlocked for this student.");
  if (!opts.force) {
    if (next.state === "NEEDS_CHECKLIST") {
      throw new ScaleApprovalError("They haven't finished the previous scale's lessons, practice, and quiz yet.");
    }
    if (next.state === "WAITING_PACE") {
      throw new ScaleApprovalError(`One new scale per week: this one can be released on ${new Date(next.availableAt).toLocaleDateString("en-US")}.`);
    }
  }

  await unlockScaleForUser(userId, next.nextSlug);

  const scale = await prisma.scaleGroup.findUnique({ where: { slug: next.nextSlug }, select: { code: true, title: true } });
  await createNotification({
    userId,
    type: "CURRICULUM_ACCESS_GRANTED",
    title: "A new scale is unlocked",
    body: scale ? `${scale.code}: ${scale.title} is ready for you.` : "Your next scale is ready for you.",
    emailCategory: "roleUpdates",
  }).catch((err) => console.error(`Failed to notify user ${userId} of a scale unlock (non-blocking):`, err));

  return next.nextSlug;
}
