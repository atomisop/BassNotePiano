import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SCALE_SLUGS } from "@/lib/curriculum";
import { createNotification } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Overview metrics
// ---------------------------------------------------------------------------

export interface OverviewStats {
  totalUsers: number;
  proUsers: number;
  pendingPayments: number;
  /** Sum of VERIFIED ZellePayment amounts — the only revenue this platform tracks. */
  totalRevenueCents: number;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const [totalUsers, proUsers, pendingPayments, revenue] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isProMember: true } }),
    prisma.zellePayment.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.zellePayment.aggregate({ where: { status: "VERIFIED" }, _sum: { amountCents: true } }),
  ]);

  return { totalUsers, proUsers, pendingPayments, totalRevenueCents: revenue._sum.amountCents ?? 0 };
}

// ---------------------------------------------------------------------------
// Curriculum / module health
// ---------------------------------------------------------------------------

export interface ModuleHealthRow {
  slug: string;
  code: string;
  title: string;
  unlockedCount: number;
  completedCount: number;
}

/** Per-scale unlock/completion counts across the whole user base — where students drop off. */
export async function getModuleHealth(): Promise<ModuleHealthRow[]> {
  const scaleGroups = await prisma.scaleGroup.findMany({ orderBy: { order: "asc" } });

  return Promise.all(
    scaleGroups.map(async (sg) => {
      const [unlockedCount, completedCount] = await Promise.all([
        prisma.scaleProgress.count({ where: { scaleGroupId: sg.id, unlockedAt: { not: null } } }),
        prisma.scaleProgress.count({ where: { scaleGroupId: sg.id, status: "COMPLETED" } }),
      ]);
      return { slug: sg.slug, code: sg.code, title: sg.title, unlockedCount, completedCount };
    }),
  );
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  isProMember: boolean;
  createdAt: Date;
  /** One entry per curriculum scale, in order — drives the per-scale unlock chips in the admin UI. */
  scaleUnlocks: { slug: string; unlocked: boolean; completed: boolean }[];
}

export async function searchUsers(query: string): Promise<AdminUserRow[]> {
  const trimmed = query.trim();
  const users = await prisma.user.findMany({
    where: trimmed
      ? {
          OR: [
            { email: { contains: trimmed, mode: "insensitive" } },
            { name: { contains: trimmed, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    include: { progress: { include: { scaleGroup: true } } },
    take: 100,
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isProMember: user.isProMember,
    createdAt: user.createdAt,
    scaleUnlocks: SCALE_SLUGS.map((slug) => {
      const progress = user.progress.find((p) => p.scaleGroup.slug === slug);
      return { slug, unlocked: Boolean(progress?.unlockedAt), completed: progress?.status === "COMPLETED" };
    }),
  }));
}

export async function setUserRole(userId: string, role: Role) {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
  const updated = await prisma.user.update({ where: { id: userId }, data: { role } });

  if (role === "ADMIN" && before.role !== "ADMIN") {
    await createNotification({
      userId,
      type: "ROLE_UPDATED",
      title: "You've been granted Admin access",
      body: "Your account now has Admin permissions — you can manage payments and users from the Admin panel.",
      emailCategory: "roleUpdates",
    });
  }

  return updated;
}

export async function setProMembership(userId: string, isPro: boolean) {
  return prisma.user.update({
    where: { id: userId },
    data: isPro ? { isProMember: true, proUnlockedAt: new Date() } : { isProMember: false, proUnlockedAt: null },
  });
}
