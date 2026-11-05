import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { claimNoticeMarker } from "@/lib/studentNotices";
import { etDayKey } from "@/lib/fingerPractice";

/**
 * The one-click reminder behind the Overview's "People to follow up with". Each kind has fixed, kind wording (the teacher does
 * not type anything), goes out as an in-app notice plus the email their own switches allow, and is only sent when the reason
 * still holds right now. Never twice to the same person for the same reason on the same day.
 */
export type ReminderKind = "overdue" | "atRisk" | "trial" | "credits";
export const REMINDER_KINDS: ReminderKind[] = ["overdue", "atRisk", "trial", "credits"];

const DAY = 86_400_000;

export type ReminderResult = { ok: true } | { ok: false; error: string };

/** Does this reason still apply to this person? Mirrors the lists in adminFollowUps.ts, one person at a time. */
async function stillApplies(kind: ReminderKind, userId: string, now: Date): Promise<boolean> {
  const t = now.getTime();
  switch (kind) {
    case "overdue":
      return (await prisma.paymentPlan.count({ where: { userId, status: "ACTIVE", nextDueDate: { lt: now } } })) > 0;
    case "atRisk": {
      const plan = await prisma.paymentPlan.count({ where: { userId, status: "ACTIVE", createdAt: { lt: new Date(t - 7 * DAY) } } });
      if (plan === 0) return false;
      return (await prisma.fingerPracticeDay.count({ where: { userId, completedAt: { gte: new Date(t - 7 * DAY) } } })) === 0;
    }
    case "trial":
      return (await prisma.user.count({ where: { id: userId, trialEndsAt: { gt: now, lt: new Date(t + DAY) }, classBookings: { none: {} } } })) > 0;
    case "credits":
      return (await prisma.creditGrant.count({ where: { userId, expiredAt: null, creditsRemaining: { gt: 0 }, expiresAt: { gt: now, lt: new Date(t + 7 * DAY) } } })) > 0;
  }
}

export async function sendFollowUpReminder(kind: ReminderKind, userId: string, now = new Date()): Promise<ReminderResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, bannedAt: true } });
  if (!user || user.role === "ADMIN") return { ok: false, error: "That account can't get a reminder." };
  if (user.bannedAt) return { ok: false, error: "This account is banned, so it is sent nothing." };
  if (!(await stillApplies(kind, userId, now))) return { ok: false, error: "That no longer applies to this person. Refresh the page." };
  if (!(await claimNoticeMarker(`followup-reminder:${kind}:${userId}:${etDayKey(now)}`))) return { ok: false, error: "A reminder like this already went to them today." };

  switch (kind) {
    case "overdue":
      await createNotification({
        userId,
        type: "PAYMENT_PLAN_UPDATED",
        title: "Your next payment is overdue",
        body: "Your class plan payment is past its due date. Please pay it to keep your weekly class. If you already paid, reply to this message or tell your teacher and we will check.",
        emailCategory: "payments",
        cta: { label: "Pay now", path: "/billing/plans" },
      });
      break;
    case "atRisk":
      await createNotification({
        userId,
        type: "PRACTICE_REMINDER",
        title: "We have not seen you practice this week",
        body: "Even ten minutes today keeps your progress moving. Your finger practice takes you straight back into it.",
        emailCategory: "reminders",
        cta: { label: "Practice now", path: "/practice" },
      });
      break;
    case "trial":
      await createNotification({
        userId,
        type: "TRIAL_ENDING",
        title: "Your free trial ends tomorrow",
        body: "You have not booked a class yet. Pick a class plan before it ends to keep learning with your teacher and unlock every lesson.",
        emailCategory: "payments",
        cta: { label: "See class plans", path: "/billing/plans" },
      });
      break;
    case "credits":
      await createNotification({
        userId,
        type: "CREDITS_EXPIRING_SOON",
        title: "You have class credits that expire this week",
        body: "Book a class before they lapse so none go to waste.",
        emailCategory: "classes",
        cta: { label: "Book a class", path: "/lessons" },
      });
      break;
  }
  return { ok: true };
}
