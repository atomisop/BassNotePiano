import { prisma } from "@/lib/prisma";
import { CREDITS_PER_CLASS } from "@/lib/classCreditPricing";
import { hasCompletedFingerPracticeToday } from "@/lib/fingerPractice";

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
}

export async function getMeStatus(userId: string): Promise<MeStatus> {
  const [user, held, practicedToday] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { classCredits: true, discordId: true } }),
    prisma.classBooking.aggregate({ where: { studentId: userId, status: "SCHEDULED" }, _sum: { creditsSpent: true } }),
    hasCompletedFingerPracticeToday(userId),
  ]);
  const heldUnits = held._sum.creditsSpent ?? 0;
  const freeUnits = Math.max(0, (user?.classCredits ?? 0) - heldUnits);
  return {
    credits: freeUnits / CREDITS_PER_CLASS,
    heldCredits: heldUnits / CREDITS_PER_CLASS,
    discordConnected: Boolean(user?.discordId),
    practicedToday,
  };
}
