import { prisma } from "@/lib/prisma";
import { CREDITS_PER_CLASS } from "@/lib/classCreditPricing";
import { getFingerPracticeStatusOnce } from "@/lib/fingerPractice";
import { getTotalUnreadMessageCount } from "@/lib/messages";
import { getTotalUnreadGroupMessageCount } from "@/lib/groupMessages";
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
  /** Unread direct, group and support messages: the dock and sidebar badge. One poll serves them all (it used to be two more). */
  unreadMessages: number;
  /** A plan bill this person pays that is open and not yet sent (their own, or a child's on a parent plan), from the day it opens until it is paid: the bill banner. */
  billDue: { amountCents: number; dueDate: string; href: string } | null;
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
  };
}

export async function getMeStatus(userId: string): Promise<MeStatus> {
  const [user, held, practice, direct, group, support, billDue] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { classCredits: true, discordId: true } }),
    prisma.classBooking.aggregate({ where: { studentId: userId, status: "SCHEDULED" }, _sum: { creditsSpent: true } }),
    getFingerPracticeStatusOnce(userId),
    getTotalUnreadMessageCount(userId),
    getTotalUnreadGroupMessageCount(userId),
    getSupportUnreadCount(userId),
    getBillDue(userId),
  ]);
  const heldUnits = held._sum.creditsSpent ?? 0;
  const freeUnits = Math.max(0, (user?.classCredits ?? 0) - heldUnits);
  return {
    credits: freeUnits / CREDITS_PER_CLASS,
    heldCredits: heldUnits / CREDITS_PER_CLASS,
    discordConnected: Boolean(user?.discordId),
    practicedToday: practice.completedToday,
    streak: practice.streak,
    unreadMessages: direct + group + support,
    billDue,
  };
}
