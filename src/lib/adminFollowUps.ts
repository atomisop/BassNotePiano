import { prisma } from "@/lib/prisma";

/**
 * People to follow up with, for the admin Overview and the morning email. Plain queries on purpose (the daily job runs outside
 * Next). Each list is capped: it names the first few people and says how many in all.
 */
export interface FollowUp {
  key: string;
  title: string;
  hint: string;
  total: number;
  /** The first few, each linking to their page. */
  people: { id: string; name: string }[];
  href: string;
}

const DAY = 86_400_000;
const SHOWN = 5;

const label = (u: { name: string | null; email: string }) => u.name ?? u.email;

export async function getFollowUps(now = new Date()): Promise<FollowUp[]> {
  const t = now.getTime();
  const [overdue, plans, trials, grants, noDiscord] = await Promise.all([
    prisma.paymentPlan.findMany({
      where: { status: "ACTIVE", nextDueDate: { lt: now } },
      orderBy: { nextDueDate: "asc" },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.paymentPlan.findMany({
      where: { status: "ACTIVE", createdAt: { lt: new Date(t - 7 * DAY) } },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.user.findMany({
      where: { trialEndsAt: { gt: now, lt: new Date(t + DAY) }, classBookings: { none: {} } },
      select: { id: true, name: true, email: true },
    }),
    prisma.creditGrant.findMany({
      where: { expiredAt: null, creditsRemaining: { gt: 0 }, expiresAt: { gt: now, lt: new Date(t + 7 * DAY) } },
      orderBy: { expiresAt: "asc" },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.user.findMany({
      where: { role: "STUDENT", bannedAt: null, discordId: null, paymentPlans: { some: { status: "ACTIVE" } } },
      select: { id: true, name: true, email: true },
    }),
  ]);

  // At risk: paying students (plan older than a week) with no full practice day in the last 7 days.
  const planUsers = new Map(plans.map((p) => [p.user.id, p.user]));
  const practicing = planUsers.size
    ? await prisma.fingerPracticeDay.findMany({
        where: { userId: { in: [...planUsers.keys()] }, completedAt: { gte: new Date(t - 7 * DAY) } },
        distinct: ["userId"],
        select: { userId: true },
      })
    : [];
  const active = new Set(practicing.map((r) => r.userId));
  const atRisk = [...planUsers.values()].filter((u) => !active.has(u.id));

  const unique = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map((r) => [r.id, r])).values()];
  const person = (u: { id: string; name: string | null; email: string }) => ({ id: u.id, name: label(u) });

  const overdueU = unique(overdue.map((o) => o.user));
  const grantU = unique(grants.map((g) => g.user));

  const lists: FollowUp[] = [
    { key: "overdue", title: "Payment overdue", hint: "Their next bill date has passed.", total: overdueU.length, people: overdueU.slice(0, SHOWN).map(person), href: "/admin/payment-plans" },
    { key: "atRisk", title: "Not practicing", hint: "Paying, but no full practice day in 7 days. A short check-in helps.", total: atRisk.length, people: atRisk.slice(0, SHOWN).map(person), href: "/admin/users?filter=idle" },
    { key: "trial", title: "Trial ends within a day", hint: "No class booked yet.", total: trials.length, people: trials.slice(0, SHOWN).map(person), href: "/admin/users" },
    { key: "credits", title: "Credits expire this week", hint: "They still have unused credits that lapse within 7 days.", total: grantU.length, people: grantU.slice(0, SHOWN).map(person), href: "/admin/users" },
    { key: "discord", title: "Discord not connected", hint: "Paying, but not linked to Discord, where classes are held.", total: noDiscord.length, people: noDiscord.slice(0, SHOWN).map(person), href: "/admin/users" },
  ];
  return lists.filter((l) => l.total > 0);
}
