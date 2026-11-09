import { prisma } from "@/lib/prisma";
import { getCurriculumEntitlements } from "@/lib/entitlement";
import { computeNextApproval, isFullAccess } from "@/lib/entitlementRules";
import { getNumberSetting } from "@/lib/siteSettings";
import { hiddenRoadmapIds } from "@/lib/roadmaps";

/** A student's next scale to release, as the teacher sees it next to a class or a chat. */
export interface NextScaleInfo {
  /** READY: approve it now. NEEDS_CHECKLIST and WAITING_PACE: the rules say wait, "Release anyway" goes past them. */
  state: "READY" | "NEEDS_CHECKLIST" | "WAITING_PACE";
  code: string;
  title: string;
  /** For WAITING_PACE: when the weekly pace allows it (ms). */
  availableAt: number | null;
}

/**
 * The next scale for several students in one read (the same rules `approveNextScale` checks). Only students with full access who are not
 * admins get an entry: a student without a paid plan has nothing to release, so no button is offered for them.
 */
export async function getNextScales(userIds: string[]): Promise<Map<string, NextScaleInfo>> {
  const out = new Map<string, NextScaleInfo>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return out;
  const [entitlements, allGroups, progress, hidden, interval] = await Promise.all([
    getCurriculumEntitlements(ids),
    prisma.scaleGroup.findMany({ orderBy: { order: "asc" }, select: { id: true, slug: true, order: true, code: true, title: true, kinitName: true, roadmapId: true } }),
    prisma.scaleProgress.findMany({ where: { userId: { in: ids } }, select: { userId: true, scaleGroupId: true, status: true, unlockedAt: true } }),
    hiddenRoadmapIds(),
    getNumberSetting("access.scaleUnlockIntervalDays"),
  ]);
  const groups = allGroups.filter((g) => !g.roadmapId || !hidden.has(g.roadmapId));
  const bySlug = new Map(groups.map((g) => [g.slug, g]));
  const now = Date.now();
  for (const id of ids) {
    const kind = entitlements.get(id)?.kind ?? "NONE";
    if (!isFullAccess(kind) || kind === "ADMIN") continue;
    const mine = new Map(progress.filter((p) => p.userId === id).map((p) => [p.scaleGroupId, p]));
    const next = computeNextApproval(
      groups.map((g) => {
        const row = mine.get(g.id);
        return { slug: g.slug, order: g.order, status: row?.status ?? "LOCKED", unlockedAt: row?.unlockedAt ? row.unlockedAt.getTime() : null };
      }),
      now,
      interval,
    );
    if (next.state === "ALL_UNLOCKED") continue;
    const g = bySlug.get(next.nextSlug);
    if (!g) continue;
    out.set(id, { state: next.state, code: g.code, title: g.kinitName ?? g.title, availableAt: next.state === "WAITING_PACE" ? next.availableAt : null });
  }
  return out;
}
