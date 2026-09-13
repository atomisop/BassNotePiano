import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SCALE_SLUGS } from "@/lib/curriculum";
import { createNotification } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Overview metrics
// ---------------------------------------------------------------------------

export interface OverviewStats {
  totalUsers: number;
  curriculumUsers: number;
  pendingPayments: number;
  /** Sum of VERIFIED ZellePayment amounts — the only revenue this platform tracks. */
  totalRevenueCents: number;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const [totalUsers, curriculumUsers, pendingPayments, revenue] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { hasCurriculumAccess: true } }),
    prisma.zellePayment.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.zellePayment.aggregate({ where: { status: "VERIFIED" }, _sum: { amountCents: true } }),
  ]);

  return { totalUsers, curriculumUsers, pendingPayments, totalRevenueCents: revenue._sum.amountCents ?? 0 };
}

// ---------------------------------------------------------------------------
// Curriculum / module health
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Trends — real time-series for the overview sparklines
// ---------------------------------------------------------------------------

export interface TrendPoint {
  label: string;
  value: number;
}

export interface OverviewTrends {
  signups: TrendPoint[];
  revenue: TrendPoint[];
}

/**
 * Signups and verified revenue bucketed by calendar month, for the last
 * `months` months including the current one.
 *
 * Computed from real rows — User.createdAt and VERIFIED ZellePayment.amountCents
 * — rather than seeded or smoothed. Months with no activity return 0 instead of
 * being dropped, so the sparkline shows a genuine flat stretch rather than
 * silently compressing time and implying steady growth that didn't happen.
 *
 * Bucketing is done in JS over the fetched rows rather than in SQL: the volumes
 * here are small (one studio's students), and a raw `$queryRaw` with
 * date_trunc would tie this to Postgres and bypass Prisma's typing for no
 * measurable gain at this scale.
 */
export async function getOverviewTrends(months = 6): Promise<OverviewTrends> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

  const [users, payments] = await Promise.all([
    prisma.user.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true },
    }),
    prisma.zellePayment.findMany({
      where: { status: "VERIFIED", updatedAt: { gte: start } },
      select: { updatedAt: true, amountCents: true },
    }),
  ]);

  const buckets: { key: string; label: string; signups: number; revenueCents: number }[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1) + i, 1));
    buckets.push({
      key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`,
      label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      signups: 0,
      revenueCents: 0,
    });
  }
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  const keyOf = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;

  for (const u of users) {
    const i = index.get(keyOf(u.createdAt));
    if (i !== undefined) buckets[i].signups += 1;
  }
  for (const p of payments) {
    const i = index.get(keyOf(p.updatedAt));
    if (i !== undefined) buckets[i].revenueCents += p.amountCents;
  }

  return {
    signups: buckets.map((b) => ({ label: b.label, value: b.signups })),
    revenue: buckets.map((b) => ({ label: b.label, value: Math.round(b.revenueCents / 100) })),
  };
}

// ---------------------------------------------------------------------------
// Student roster — one sortable row per student
// ---------------------------------------------------------------------------

export interface StudentRosterRow {
  id: string;
  name: string;
  email: string;
  hasCurriculumAccess: boolean;
  scalesCompleted: number;
  classCredits: number;
  currentStreak: number;
  /** ms since epoch, or null. A number so the table can sort it. */
  lastActivityAt: number | null;
  joinedAt: number;
}

/**
 * Every student, with the handful of figures a teacher actually scans for.
 *
 * Admins are excluded — this is the roster of people being taught, and mixing
 * staff accounts into it makes counts like "how many students have curriculum
 * access" wrong.
 *
 * scalesCompleted is counted from ScaleProgress rows with status COMPLETED
 * rather than stored on the user, so it can't drift from the checklist the
 * student actually sees.
 */
export async function getStudentRoster(): Promise<StudentRosterRow[]> {
  const users = await prisma.user.findMany({
    where: { role: "STUDENT" },
    select: {
      id: true,
      name: true,
      email: true,
      hasCurriculumAccess: true,
      classCredits: true,
      currentStreak: true,
      lastActivityDate: true,
      createdAt: true,
      progress: { where: { status: "COMPLETED" }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name ?? "—",
    email: u.email,
    hasCurriculumAccess: u.hasCurriculumAccess,
    scalesCompleted: u.progress.length,
    classCredits: u.classCredits,
    currentStreak: u.currentStreak,
    lastActivityAt: u.lastActivityDate ? u.lastActivityDate.getTime() : null,
    joinedAt: u.createdAt.getTime(),
  }));
}

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
  hasCurriculumAccess: boolean;
  createdAt: Date;
  /** One entry per curriculum scale, in order — drives the per-scale unlock chips in the admin UI. */
  scaleUnlocks: { slug: string; unlocked: boolean; completed: boolean }[];
  /** How many Atom messages this account has stored — 0 means the "Clear Atom history" action has nothing to do. */
  assistantMessageCount: number;
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
    include: {
      progress: { include: { scaleGroup: true } },
      _count: { select: { assistantConversation: true } },
    },
    take: 100,
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    hasCurriculumAccess: user.hasCurriculumAccess,
    createdAt: user.createdAt,
    scaleUnlocks: SCALE_SLUGS.map((slug) => {
      const progress = user.progress.find((p) => p.scaleGroup.slug === slug);
      return { slug, unlocked: Boolean(progress?.unlockedAt), completed: progress?.status === "COMPLETED" };
    }),
    assistantMessageCount: user._count.assistantConversation,
  }));
}

export interface BookableStudent {
  id: string;
  name: string | null;
  email: string;
  hasCurriculumAccess: boolean;
  classCredits: number;
}

/**
 * Lightweight student lookup for the admin manual-booking tool
 * (AdminManualBooking.tsx), deliberately its own query rather than reusing
 * searchUsers above: that one already joins curriculum progress and Atom
 * message counts for the full user-management table, neither of which this
 * picker needs, just enough to show a name/email and know whether booking
 * them even makes sense (curriculum access, a free credit). Requires an
 * actual query rather than searchUsers' "empty means everyone": dumping
 * every signed-up user into a picker before the admin has typed anything
 * isn't useful the way it is on the dedicated Users page.
 */
export async function searchStudentsForBooking(query: string): Promise<BookableStudent[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const users = await prisma.user.findMany({
    where: {
      OR: [{ email: { contains: trimmed, mode: "insensitive" } }, { name: { contains: trimmed, mode: "insensitive" } }],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, hasCurriculumAccess: true, classCredits: true },
    take: 20,
  });

  return users;
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

/**
 * The account a "Message support" link should open a conversation with —
 * the longest-standing admin account, so it stays stable even if more
 * admins are added later. Returns null in the (shouldn't-happen-in-prod)
 * case of no admin existing yet, so callers can hide the link instead of
 * linking somewhere broken.
 */
export async function getSupportContactId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return admin?.id ?? null;
}

export async function setCurriculumAccess(userId: string, hasAccess: boolean) {
  return prisma.user.update({
    where: { id: userId },
    data: hasAccess
      ? { hasCurriculumAccess: true, curriculumUnlockedAt: new Date() }
      : { hasCurriculumAccess: false, curriculumUnlockedAt: null },
  });
}
