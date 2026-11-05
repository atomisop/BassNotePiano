"use server";

import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { describePaymentPlan, formatCredits, storedToCredits } from "@/lib/classCreditPricing";

export interface PersonPeek {
  id: string;
  name: string | null;
  email: string;
  banned: boolean;
  facts: { label: string; value: string; warn?: boolean }[];
}

const when = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The short summary in the side panel of Accounts. Admin only; the check here is the real boundary. */
export async function personPeekAction(userId: string): Promise<PersonPeek | null> {
  const session = await getServerAuthSession();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  if (typeof userId !== "string" || userId.length > 64) return null;
  const [user, plan, next] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, bannedAt: true, classCredits: true, currentStreak: true, discordId: true, lastActivityDate: true } }),
    prisma.paymentPlan.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, select: { cadence: true, term: true, nextDueDate: true } }),
    prisma.classBooking.findFirst({ where: { studentId: userId, status: "SCHEDULED", scheduledAt: { gt: new Date() } }, orderBy: { scheduledAt: "asc" }, select: { scheduledAt: true } }),
  ]);
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    banned: Boolean(user.bannedAt),
    facts: [
      { label: "Plan", value: plan ? describePaymentPlan(plan.cadence, plan.term) : "None" },
      { label: "Next bill", value: plan ? when(plan.nextDueDate).replace(/, \d+:\d+ [AP]M$/, "") : "None", warn: !!plan && plan.nextDueDate.getTime() < Date.now() },
      { label: "Credits", value: formatCredits(storedToCredits(user.classCredits)) },
      { label: "Next class", value: next ? when(next.scheduledAt) : "None booked" },
      { label: "Discord", value: user.discordId ? "Linked" : "Not linked", warn: !user.discordId },
      { label: "Streak", value: `${user.currentStreak} days` },
      { label: "Last active", value: user.lastActivityDate ? when(user.lastActivityDate) : "Not seen yet" },
    ],
  };
}
