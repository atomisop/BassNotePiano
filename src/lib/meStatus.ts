import { prisma } from "@/lib/prisma";
import { getNumberSetting } from "@/lib/siteSettings";
import { CREDITS_PER_CLASS } from "@/lib/classCreditPricing";
import { getFingerPracticeStatusOnce } from "@/lib/fingerPractice";
import { getSupportUnreadCount } from "@/lib/messagesSupport";

/**
 * The few facts about the signed-in person that several parts of the screen show at once (the credit badge in the top bar,
 * the Discord and practice banners). One place computes them, and one client provider (MeStatusProvider) keeps every one of
 * them current, so a change made anywhere (an admin grants credits, a payment clears, Discord is disconnected) shows up
 * everywhere without a page reload.
 */
export interface MeStatus {
  /** Credits they can spend now, in 45 minute credits (one class is one credit): the balance minus classes already booked. */
  credits: number;
  /** Credits held by classes they have booked but that have not happened yet. */
  heldCredits: number;
  discordConnected: boolean;
  practicedToday: boolean;
  /** Days in a row of the 10 minute practice (ending today, or yesterday while today is not done yet): the streak icon in the top bar. */
  streak: number;
  /** The team's replies in the person's Support thread they have not opened yet: part of the bell's count. */
  unreadMessages: number;
  /** The newest unread nudge from a friend in the last 6 hours (shown once as a banner), or null. */
  pendingNudge: { id: string; title: string } | null;
  /** A plan bill this person pays that is open and not yet sent (their own, or a child's on a parent plan), from the day it opens until it is paid: the bill bar. */
  billDue: { amountCents: number; dueDate: string; href: string; lapseAfterDays: number } | null;
}

/**
 * The oldest renewal bill (second payment on) this person still has to send. A child on a parent plan never sees their bill (the parent
 * pays it); the parent sees it and is sent to /parent. A first payment is left out: it is part of starting a plan, not a renewal.
 */
async function getBillDue(userId: string): Promise<MeStatus["billDue"]> {
  const bill = await prisma.zellePayment.findFirst({
    where: {
      status: "AWAITING_TRANSFER",
      purpose: "PAYMENT_PLAN_INSTALLMENT",
      installmentNumber: { gte: 2 },
      paymentPlan: {
        status: "ACTIVE",
        OR: [
          { userId, familyGroupId: null },
          { userId, familyGroup: { kind: "FAMILY" } },
          { familyGroup: { kind: "PARENT", payerId: userId } },
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    select: { amountCents: true, paymentPlan: { select: { userId: true, nextDueDate: true } } },
  });
  if (!bill?.paymentPlan) return null;
  return {
    amountCents: bill.amountCents,
    dueDate: bill.paymentPlan.nextDueDate.toISOString(),
    href: bill.paymentPlan.userId === userId ? "/billing/plans" : "/parent",
    lapseAfterDays: await getNumberSetting("payments.lapseAfterDays"),
  };
}

export async function getMeStatus(userId: string): Promise<MeStatus> {
  const [user, held, practice, support, billDue, nudge] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { classCredits: true, discordId: true } }),
    prisma.classBooking.aggregate({ where: { studentId: userId, status: "SCHEDULED" }, _sum: { creditsSpent: true } }),
    getFingerPracticeStatusOnce(userId),
    getSupportUnreadCount(userId),
    getBillDue(userId),
    prisma.notification.findFirst({
      where: { userId, type: "FRIEND_NUDGE", readAt: null, createdAt: { gt: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true },
    }),
  ]);
  const heldUnits = held._sum.creditsSpent ?? 0;
  const freeUnits = Math.max(0, (user?.classCredits ?? 0) - heldUnits);
  return {
    credits: freeUnits / CREDITS_PER_CLASS,
    heldCredits: heldUnits / CREDITS_PER_CLASS,
    discordConnected: Boolean(user?.discordId),
    practicedToday: practice.completedToday,
    streak: practice.streak,
    unreadMessages: support,
    billDue,
    pendingNudge: nudge,
  };
}
