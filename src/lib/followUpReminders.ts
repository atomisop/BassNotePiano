import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { claimNoticeMarker } from "@/lib/studentNotices";
import { etDayKey } from "@/lib/fingerPractice";
import { getFollowUpPeople } from "@/lib/adminFollowUps";
import { planBillTarget, type PlanBillTarget } from "@/lib/planBillPayer";
import { describeBillScholarship } from "@/lib/scholarshipPlans";
import { scholarshipOverdueLine } from "@/lib/scholarshipWording";

/**
 * The one-click reminder behind People > Accounts' "Follow up". Each kind has fixed, kind wording (the teacher does not type
 * anything), goes out as an in-app notice plus the email their own switches allow, and is only sent when the reason still holds
 * right now. Never twice to the same person for the same reason on the same day. An overdue bill on a group or parent plan is the
 * payer's to pay, so that reminder goes to the payer, for the group's combined bill when there is one.
 */
export type ReminderKind = "overdue" | "atRisk" | "trial" | "credits" | "discord";
export const REMINDER_KINDS: ReminderKind[] = ["overdue", "atRisk", "trial", "credits", "discord"];

const DAY = 86_400_000;
/** "Remind all" goes through at most this many people in one tap. */
const BULK_CAP = 200;

export type ReminderResult = { ok: true; sentTo: string } | { ok: false; error: string };

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const PAID_ALREADY = "If you already paid, reply to this message or tell your teacher and we will check.";

/** Does this reason still apply to this person? Mirrors the lists in adminFollowUps.ts, one person at a time. */
async function stillApplies(kind: ReminderKind, userId: string, now: Date): Promise<boolean> {
  const t = now.getTime();
  switch (kind) {
    case "overdue":
      return (await prisma.paymentPlan.count({ where: { userId, status: "ACTIVE", nextDueDate: { lt: now }, installmentAmountCents: { gt: 0 } } })) > 0;
    case "atRisk": {
      const plan = await prisma.paymentPlan.count({ where: { userId, status: "ACTIVE", createdAt: { lt: new Date(t - 7 * DAY) } } });
      if (plan === 0) return false;
      return (await prisma.fingerPracticeDay.count({ where: { userId, completedAt: { gte: new Date(t - 7 * DAY) } } })) === 0;
    }
    case "trial":
      return (await prisma.user.count({ where: { id: userId, trialEndsAt: { gt: now, lt: new Date(t + DAY) }, classBookings: { none: {} } } })) > 0;
    case "discord":
      return (await prisma.user.count({ where: { id: userId, discordId: null, paymentPlans: { some: { status: "ACTIVE" } } } })) > 0;
    case "credits":
      return (await prisma.creditGrant.count({ where: { userId, expiredAt: null, creditsRemaining: { gt: 0 }, expiresAt: { gt: now, lt: new Date(t + 7 * DAY) } } })) > 0;
  }
}

/** Who pays the person's overdue bill and which bill it is (the oldest overdue plan), or null when nothing is overdue. */
async function overdueBill(userId: string, now: Date): Promise<PlanBillTarget | null> {
  const plan = await prisma.paymentPlan.findFirst({ where: { userId, status: "ACTIVE", nextDueDate: { lt: now }, installmentAmountCents: { gt: 0 } }, orderBy: { nextDueDate: "asc" }, select: { id: true } });
  return plan ? planBillTarget(plan.id) : null;
}

/** The overdue notice, worded for whoever pays: the person themselves, a payer paying one member's bill, or the group's combined bill. */
function overdueNotice(target: PlanBillTarget | null, scholarshipLine: string | null = null): { title: string; body: string; path: string } {
  const bill = target?.bill;
  const amount = bill ? ` of ${money(bill.amountCents)}` : "";
  const path = target?.payPath ?? "/billing/plans";
  if (bill?.combined) {
    return {
      title: "Your combined bill is overdue",
      body: `The one 28-day bill${amount} for ${bill.people} people is past its due date. Please pay it to keep everyone's weekly class. ${PAID_ALREADY}`,
      path,
    };
  }
  if (target?.paysForSomeoneElse) {
    const who = target.member.name;
    return {
      title: `${who}'s bill is overdue`,
      body: `The 28-day bill${amount} for ${who}'s classes is past its due date. You pay it for them. Please pay it to keep their weekly class. ${PAID_ALREADY}`,
      path,
    };
  }
  return {
    title: "Your next payment is overdue",
    // A partial scholarship: the reminder names what is left to pay.
    body: `Your class plan payment is past its due date. ${scholarshipLine ? `${scholarshipLine} ` : ""}Please pay it to keep your weekly class. ${PAID_ALREADY}`,
    path,
  };
}

export async function sendFollowUpReminder(kind: ReminderKind, userId: string, now = new Date()): Promise<ReminderResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, bannedAt: true } });
  if (!user || user.role === "ADMIN") return { ok: false, error: "That account can't get a reminder." };
  if (user.bannedAt) return { ok: false, error: "This account is banned, so it is sent nothing." };
  if (!(await stillApplies(kind, userId, now))) return { ok: false, error: "That no longer applies to this person. Refresh the page." };

  // A bill on a group or parent plan is the payer's to pay: the reminder goes to them.
  let recipientId = userId;
  let bill: PlanBillTarget | null = null;
  if (kind === "overdue") {
    bill = await overdueBill(userId, now);
    if (bill?.paysForSomeoneElse) {
      if (bill.payer.role === "ADMIN") return { ok: false, error: "An admin pays this bill, so no reminder was sent." };
      if (bill.payer.bannedAt) return { ok: false, error: "The person who pays this bill is banned, so they are sent nothing." };
      recipientId = bill.payer.id;
    }
  }
  if (!(await claimNoticeMarker(`followup-reminder:${kind}:${recipientId}:${etDayKey(now)}`))) {
    return { ok: false, error: recipientId === userId ? "A reminder like this already went to them today." : `A reminder like this already went to ${bill?.payer.name ?? "the person who pays"} today.` };
  }

  switch (kind) {
    case "overdue": {
      let scholarshipLine: string | null = null;
      if (bill?.bill && !bill.bill.combined && !bill.paysForSomeoneElse) {
        const plan = await prisma.paymentPlan.findFirst({ where: { userId, status: "ACTIVE", nextDueDate: { lt: now }, installmentAmountCents: { gt: 0 } }, orderBy: { nextDueDate: "asc" }, select: { userId: true, term: true, listAmountCents: true, familyGroupId: true } });
        const scholarship = plan ? await describeBillScholarship(plan, bill.bill.amountCents) : null;
        if (scholarship) scholarshipLine = scholarshipOverdueLine(scholarship);
      }
      const notice = overdueNotice(bill, scholarshipLine);
      await createNotification({
        userId: recipientId,
        type: "PAYMENT_PLAN_UPDATED",
        title: notice.title,
        body: notice.body,
        emailCategory: "payments",
        cta: { label: "Pay now", path: notice.path },
      });
      break;
    }
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
    case "discord":
      await createNotification({
        userId,
        type: "BANNER_DISCORD",
        title: "Connect Discord to join your class",
        body: "Your live classes are held on Discord. Connect your account so you can join on time.",
        emailCategory: "classes",
        cta: { label: "Connect Discord", path: "/lessons" },
      });
      break;
  }
  return { ok: true, sentTo: recipientId };
}

export interface BulkReminderResult {
  /** One entry per reminder that went out: whose follow-up it was, and who it went to (the payer, for a group's bill). */
  sent: { userId: string; sentTo: string }[];
  /** Already reminded today, no longer due, an admin, or banned. */
  skipped: number;
}

/**
 * "Remind all": the same fixed reminder to everyone the reason applies to right now (worked out here, never taken from the screen).
 * Each person goes through `sendFollowUpReminder`, so its once-a-day guard and its checks hold: two children on one group plan
 * remind their payer once.
 */
export async function sendFollowUpRemindersToAll(kind: ReminderKind, now = new Date()): Promise<BulkReminderResult> {
  const people = (await getFollowUpPeople(kind, now)).slice(0, BULK_CAP);
  const result: BulkReminderResult = { sent: [], skipped: 0 };
  for (const p of people) {
    const r = await sendFollowUpReminder(kind, p.id, now).catch(() => ({ ok: false as const, error: "failed" }));
    if (r.ok) result.sent.push({ userId: p.id, sentTo: r.sentTo });
    else result.skipped++;
  }
  return result;
}
