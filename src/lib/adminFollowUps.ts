import { prisma } from "@/lib/prisma";

/**
 * People to follow up with, for People > Accounts, the Overview's "Needs you" and the morning email. Plain queries on purpose (the
 * daily job runs outside Next). Each list names the first few people, carries the rest for the screen to open in place, and says how
 * many in all.
 */
export interface FollowUpPerson {
  id: string;
  name: string;
  /** Someone else pays this person's bill (a group or parent plan): a reminder about the bill goes to them. */
  payer?: { id: string; name: string };
}

export interface FollowUp {
  key: string;
  title: string;
  hint: string;
  total: number;
  /** The first few, each linking to their page. */
  people: FollowUpPerson[];
  /** The rest (up to a cap), so "and N more" opens in place instead of sending the owner to another page. */
  more: FollowUpPerson[];
  href: string;
}

/** The reasons to follow up on, each naming its people. */
export type FollowUpPeopleKind = "overdue" | "atRisk" | "trial" | "credits" | "discord";

/** The Accounts list filters that show exactly one follow-up reason's people (`/admin/users?filter=...`). */
export const ACCOUNT_FOLLOW_UP_FILTERS = ["trial", "credits", "discord"] as const;
export type AccountFollowUpFilter = (typeof ACCOUNT_FOLLOW_UP_FILTERS)[number];

const DAY = 86_400_000;
const SHOWN = 5;
const MORE_CAP = 200;

const label = (u: { name: string | null; email: string }) => u.name ?? u.email;
const person = (u: { id: string; name: string | null; email: string }): FollowUpPerson => ({ id: u.id, name: label(u) });
const unique = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map((r) => [r.id, r])).values()];

/** Everyone a reason applies to right now, most urgent first. The same rules `stillApplies` in followUpReminders.ts checks one person at a time. */
export async function getFollowUpPeople(kind: FollowUpPeopleKind, now = new Date()): Promise<FollowUpPerson[]> {
  const t = now.getTime();
  switch (kind) {
    case "overdue": {
      const plans = await prisma.paymentPlan.findMany({
        // A plan that costs nothing (a full scholarship) is never late: there is no bill to chase.
        where: { status: "ACTIVE", nextDueDate: { lt: now }, installmentAmountCents: { gt: 0 } },
        orderBy: { nextDueDate: "asc" },
        select: { user: { select: { id: true, name: true, email: true } }, familyGroup: { select: { payer: { select: { id: true, name: true, email: true } } } } },
      });
      return unique(
        plans.map((p) => {
          const payer = p.familyGroup?.payer;
          return { ...person(p.user), ...(payer && payer.id !== p.user.id ? { payer: person(payer) } : {}) };
        }),
      );
    }
    case "atRisk": {
      // Paying students (plan older than a week) with no full practice day in the last 7 days.
      const plans = await prisma.paymentPlan.findMany({
        where: { status: "ACTIVE", createdAt: { lt: new Date(t - 7 * DAY) } },
        select: { user: { select: { id: true, name: true, email: true } } },
      });
      const planUsers = new Map(plans.map((p) => [p.user.id, p.user]));
      if (planUsers.size === 0) return [];
      const practicing = await prisma.fingerPracticeDay.findMany({
        where: { userId: { in: [...planUsers.keys()] }, completedAt: { gte: new Date(t - 7 * DAY) } },
        distinct: ["userId"],
        select: { userId: true },
      });
      const active = new Set(practicing.map((r) => r.userId));
      return [...planUsers.values()].filter((u) => !active.has(u.id)).map(person);
    }
    case "trial": {
      const users = await prisma.user.findMany({
        where: { trialEndsAt: { gt: now, lt: new Date(t + DAY) }, classBookings: { none: {} } },
        orderBy: { trialEndsAt: "asc" },
        select: { id: true, name: true, email: true },
      });
      return users.map(person);
    }
    case "credits": {
      const grants = await prisma.creditGrant.findMany({
        where: { expiredAt: null, creditsRemaining: { gt: 0 }, expiresAt: { gt: now, lt: new Date(t + 7 * DAY) } },
        orderBy: { expiresAt: "asc" },
        select: { user: { select: { id: true, name: true, email: true } } },
      });
      return unique(grants.map((g) => person(g.user)));
    }
    case "discord": {
      const users = await prisma.user.findMany({
        where: { role: "STUDENT", bannedAt: null, discordId: null, paymentPlans: { some: { status: "ACTIVE" } } },
        select: { id: true, name: true, email: true },
      });
      return users.map(person);
    }
  }
}

const REASONS: { key: FollowUpPeopleKind; title: string; hint: string; href: string }[] = [
  { key: "overdue", title: "Payment overdue", hint: "Their next bill date has passed. A group's bill reminder goes to the person who pays it.", href: "/admin/payment-plans?status=OVERDUE" },
  { key: "atRisk", title: "Not practicing", hint: "Paying, but no full practice day in 7 days. A short check-in helps.", href: "/admin/users?filter=idle" },
  { key: "trial", title: "Trial ends within a day", hint: "No class booked yet.", href: "/admin/users?filter=trial" },
  { key: "credits", title: "Credits expire this week", hint: "They still have unused credits that lapse within 7 days.", href: "/admin/users?filter=credits" },
  { key: "discord", title: "Discord not connected", hint: "Paying, but not linked to Discord, where classes are held.", href: "/admin/users?filter=discord" },
];

export async function getFollowUps(now = new Date()): Promise<FollowUp[]> {
  const lists = await Promise.all(REASONS.map(async (r) => ({ ...r, all: await getFollowUpPeople(r.key, now) })));
  const named: FollowUp[] = lists.map(({ all, ...r }) => ({
    ...r,
    total: all.length,
    people: all.slice(0, SHOWN),
    more: all.slice(SHOWN, SHOWN + MORE_CAP),
  }));
  return named.filter((l) => l.total > 0);
}
