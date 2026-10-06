import { isOwnerEmail } from "@/lib/adminNotifications";
import { getCurriculumEntitlements } from "@/lib/entitlement";
import { computeNextApproval, isFullAccess, type CurriculumAccessKind, type NextApproval } from "@/lib/entitlementRules";
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
  /** Money submitted but not approved yet, so it is not in the total above. */
  pendingRevenueCents: number;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const [totalUsers, curriculumUsers, pendingPayments, revenue, pendingSum] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { hasCurriculumAccess: true } }),
    prisma.zellePayment.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.zellePayment.aggregate({ where: { status: "VERIFIED" }, _sum: { amountCents: true } }),
    prisma.zellePayment.aggregate({ where: { status: "PENDING_REVIEW" }, _sum: { amountCents: true } }),
  ]);

  return { totalUsers, curriculumUsers, pendingPayments, totalRevenueCents: revenue._sum.amountCents ?? 0, pendingRevenueCents: pendingSum._sum.amountCents ?? 0 };
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

// Student roster (name/email/curriculum/scales/credits/streak/last-active
// per student) used to live here as its own /admin/roster page — folded
// into /admin/progress instead (see AdminProgressRow/getAdminProgressOverview
// below), by direct instruction, since it was the exact same student list
// with the exact same summary figures, just missing the per-scale detail
// the Progress page already had.

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

export interface AdminProgressScaleCell {
  slug: string;
  code: string;
  order: number;
  title: string;
  status: "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "COMPLETED";
  unlocked: boolean;
  /** ms epoch the teacher released (or the student opened) this scale, null if never. */
  unlockedAt: number | null;
  moduleRead: boolean;
  practiceCompleted: boolean;
  quizPassed: boolean;
  quizScore: number | null;
}

export interface AdminProgressRow {
  id: string;
  name: string | null;
  email: string;
  /** True for a live student (active plan), complimentary access, or admin: anyone whose curriculum opens scale by scale. */
  hasCurriculumAccess: boolean;
  accessKind: CurriculumAccessKind;
  /** ms epoch access lapses (plan paid period or trial end), null when it doesn't. */
  accessUntil: number | null;
  /** What the teacher would release next and whether the automatic rules allow it yet. */
  nextApproval: NextApproval;
  /** Folded in from the old, now-removed /admin/roster page — same figures a teacher used to check there, in the same row as the scale-by-scale detail. */
  classCredits: number;
  currentStreak: number;
  lastActivityAt: number | null;
  scalesCompleted: number;
  scales: AdminProgressScaleCell[];
}

/**
 * One row per student with every scale's full checklist state (not just
 * unlocked/completed, like AdminUserRow.scaleUnlocks above) — feeds the
 * dedicated /admin/progress matrix, which exists so a teacher can see
 * exactly where a student is stuck (module read but quiz never passed,
 * say) and lock/unlock in the same glance, instead of opening each
 * student's full profile page just to check the roadmap.
 */
export async function getAdminProgressOverview(query: string): Promise<AdminProgressRow[]> {
  const trimmed = query.trim();
  const scaleGroups = await prisma.scaleGroup.findMany({ orderBy: { order: "asc" } });

  const users = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      ...(trimmed
        ? {
            OR: [
              { email: { contains: trimmed, mode: "insensitive" } },
              { name: { contains: trimmed, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      hasCurriculumAccess: true,
      classCredits: true,
      currentStreak: true,
      lastActivityDate: true,
      progress: true,
    },
    take: 200,
  });

  const entitlements = await getCurriculumEntitlements(users.map((u) => u.id));
  const nowMs = Date.now();

  return users.map((user) => {
    const entitlement = entitlements.get(user.id) ?? { kind: "NONE" as const, until: null };
    const scales = scaleGroups.map((sg) => {
      const row = user.progress.find((p) => p.scaleGroupId === sg.id);
      return {
        slug: sg.slug,
        code: sg.code,
        order: sg.order,
        title: sg.kinitName ?? sg.title,
        status: row?.status ?? "LOCKED",
        unlocked: Boolean(row?.unlockedAt),
        unlockedAt: row?.unlockedAt ? row.unlockedAt.getTime() : null,
        moduleRead: row?.moduleRead ?? false,
        practiceCompleted: row?.practiceCompleted ?? false,
        quizPassed: row?.quizPassed ?? false,
        quizScore: row?.quizScore ?? null,
      };
    });
    return {
    id: user.id,
    name: user.name,
    email: user.email,
    hasCurriculumAccess: isFullAccess(entitlement.kind),
    accessKind: entitlement.kind,
    accessUntil: entitlement.until ? entitlement.until.getTime() : null,
    nextApproval: computeNextApproval(scales, nowMs),
    classCredits: user.classCredits,
    currentStreak: user.currentStreak,
    lastActivityAt: user.lastActivityDate ? user.lastActivityDate.getTime() : null,
    scalesCompleted: user.progress.filter((p) => p.status === "COMPLETED").length,
    scales,
    };
  });
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
/**
 * Empty query now returns a browsable default list (most recently active
 * first) instead of nothing — by direct instruction, after "finding
 * someone requires remembering their exact name or email" feedback on the
 * manual-booking tool. Same "empty means show something useful, not
 * nothing" convention searchUsersForCredits already uses on the Credits
 * page, just ordered by lastActivityDate instead of createdAt: an admin
 * helping with a booking issue is almost always looking for someone who
 * was just active (mid-conversation about it right now), not a brand-new
 * signup.
 */
export async function searchStudentsForBooking(query: string): Promise<BookableStudent[]> {
  const trimmed = query.trim();

  const users = await prisma.user.findMany({
    where: trimmed
      ? { OR: [{ email: { contains: trimmed, mode: "insensitive" } }, { name: { contains: trimmed, mode: "insensitive" } }] }
      : undefined,
    orderBy: trimmed ? { name: "asc" } : [{ lastActivityDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: { id: true, name: true, email: true, hasCurriculumAccess: true, classCredits: true },
    take: 20,
  });

  return users;
}

export async function setUserRole(userId: string, role: Role) {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
  // Losing admin signs every open session out (sessionVersion), so the old
  // admin tab stops working immediately instead of at its next refresh.
  const updated = await prisma.user.update({
    where: { id: userId },
    data: role === "ADMIN" ? { role } : { role, ...(before.role === "ADMIN" ? { sessionVersion: { increment: 1 } } : {}) },
  });

  if (role === "ADMIN" && before.role !== "ADMIN") {
    await createNotification({
      userId,
      type: "ROLE_UPDATED",
      title: "You've been granted Admin access",
      body: "Your account now has Admin permissions. You can manage payments and users from the Admin panel.",
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

/**
 * Admin manual grant/revoke of curriculum access — direct from /admin/users
 * or a student's own profile there, entirely separate from the normal paid
 * unlock flow (approveZellePayment's CURRICULUM/CURRICULUM_FAMILY_BUNDLE
 * branches). That flow already notifies (PAYMENT_APPROVED, and
 * CURRICULUM_ACCESS_GRANTED for a family-bundle recipient who never paid
 * themselves) — this manual path had no notification at all until now, so
 * a student granted access this way had no way to find out short of
 * happening to revisit the dashboard and noticing scales were unlocked.
 * Reuses the same CURRICULUM_ACCESS_GRANTED type the bundle-recipient path
 * already uses; revoke gets its own message rather than silently reusing a
 * "granted" type for the opposite event.
 */
export async function setCurriculumAccess(userId: string, hasAccess: boolean) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: hasAccess
      ? { hasCurriculumAccess: true, curriculumUnlockedAt: new Date() }
      : { hasCurriculumAccess: false, curriculumUnlockedAt: null },
  });

  await createNotification({
    userId,
    type: hasAccess ? "CURRICULUM_ACCESS_GRANTED" : "CURRICULUM_ACCESS_REVOKED",
    title: hasAccess ? "Curriculum unlocked" : "Curriculum access removed",
    body: hasAccess
      ? "You now have complimentary access to the curriculum. Your teacher opens it one scale at a time."
      : "Your curriculum access was removed. Message support if this looks wrong.",
    emailCategory: "payments",
  }).catch((err) => console.error(`Failed to notify user ${userId} of curriculum access change (non-blocking):`, err));

  return user;
}

export interface EmployeeRow {
  id: string;
  name: string | null;
  email: string;
  createdAt: Date;
  isOwner: boolean;
}

/** Every admin account, longest-standing first. The first one is the owner and cannot be revoked here. */
export async function listEmployees(): Promise<EmployeeRow[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, createdAt: true },
  });
  return admins.map((admin) => ({ ...admin, isOwner: isOwnerEmail(admin.email) }));
}

/** Takes admin access away from one employee. Refuses the owner, yourself, and the last admin. */
export async function revokeEmployee(targetUserId: string, actingAdminId: string) {
  if (targetUserId === actingAdminId) throw new Error("You can't revoke your own admin access.");
  const admins = await listEmployees();
  const target = admins.find((admin) => admin.id === targetUserId);
  if (!target) throw new Error("That account isn't an admin.");
  if (target.isOwner) throw new Error("The owner account can't be revoked.");
  if (admins.length <= 1) throw new Error("There must always be one admin.");
  await setUserRole(targetUserId, "STUDENT");
}

export interface SubscriptionStats {
  active: number;
  /** What active plans bring in per month: every installment is monthly. */
  monthlyCents: number;
  overdue: number;
  dueSoon: number;
  dueSoonCents: number;
  refundedCents: number;
}

export async function getSubscriptionStats(): Promise<SubscriptionStats> {
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 86_400_000);
  const [plans, refunded] = await Promise.all([
    prisma.paymentPlan.findMany({ where: { status: "ACTIVE", installmentsPaid: { gte: 1 } }, select: { installmentAmountCents: true, nextDueDate: true } }),
    prisma.zellePayment.aggregate({ where: { status: "REFUNDED" }, _sum: { amountCents: true } }),
  ]);
  const soon = plans.filter((p) => p.nextDueDate >= now && p.nextDueDate <= week);
  return {
    active: plans.length,
    monthlyCents: plans.reduce((sum, p) => sum + p.installmentAmountCents, 0),
    overdue: plans.filter((p) => p.nextDueDate < now).length,
    dueSoon: soon.length,
    dueSoonCents: soon.reduce((sum, p) => sum + p.installmentAmountCents, 0),
    refundedCents: refunded._sum.amountCents ?? 0,
  };
}

export interface AttentionItem {
  label: string;
  count: number;
  href: string;
}

/** Everything waiting on the owner or staff right now, each with the page that handles it. Items with nothing waiting are left out. */
export async function getAttentionItems(): Promise<AttentionItem[]> {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
  const [payments, applications, chats, unmarked, progress] = await Promise.all([
    prisma.zellePayment.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.classRegistration.count({ where: { status: "PENDING" } }),
    prisma.assistantEscalation.count({ where: { status: "OPEN" } }),
    prisma.classBooking.count({ where: { status: "SCHEDULED", scheduledAt: { lt: hoursAgo(3) } } }),
    getAdminProgressOverview(""),
  ]);
  const readyScales = progress.filter((p) => p.hasCurriculumAccess && p.accessKind !== "ADMIN" && p.nextApproval.state === "READY").length;
  const items: AttentionItem[] = [
    { label: payments === 1 ? "Payment to review" : "Payments to review", count: payments, href: "/admin/payments" },
    { label: applications === 1 ? "Class application" : "Class applications", count: applications, href: "/admin/students" },
    { label: chats === 1 ? "Open support chat" : "Open support chats", count: chats, href: "/admin/support" },
    { label: unmarked === 1 ? "Finished class to mark" : "Finished classes to mark", count: unmarked, href: "/admin/schedule?view=ATTENDANCE" },
    { label: readyScales === 1 ? "Student ready for the next scale" : "Students ready for the next scale", count: readyScales, href: "/admin/users?filter=approval" },
  ];
  return items.filter((i) => i.count > 0);
}
