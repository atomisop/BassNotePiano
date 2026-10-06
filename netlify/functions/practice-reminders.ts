import { schedule } from "@netlify/functions";
import { runJob } from "../../src/lib/jobRun";
import { todayBoundsEt } from "../../src/lib/classSchedule";
import { prisma } from "../../src/lib/prisma";
import { createNotification } from "../../src/lib/notifications";

// Nudge points, in days since last practice activity — spaced out (not
// daily) so a lapsed student gets a few gentle reminders rather than one
// per day forever.
//
// Unlike every other notification category (payments, role updates,
// social), which always create the in-app bell entry and let
// notifyEmail* only decide whether it's *also* emailed, practice
// reminders skip the user entirely — no bell entry, no email — when
// notifyEmailReminders is off. Turning "Practice reminders" off in
// Settings is meant to mean silence, not "email off, bell still nags."
const REMINDER_TRIGGER_DAYS = [1, 3, 7, 14, 30];

function daysSince(date: Date, now: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const a = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

// Runs once daily at 15:00 UTC. Only considers users who've completed
// onboarding and have practiced at least once — someone who signed up and
// never started doesn't need a "come back" nudge, they need an onboarding
// flow (already handled separately).
export const handler = schedule("0 15 * * *", async () =>
  runJob("practice-reminders", async () => {
  const now = new Date();
  const users = await prisma.user.findMany({
    where: { onboardedAt: { not: null }, lastActivityDate: { not: null }, notifyEmailReminders: true },
    select: { id: true, lastActivityDate: true },
  });

  // Someone with a live class today does not need a "practice" nudge on top of it.
  const today = todayBoundsEt();
  const hasClassToday = new Set(
    (
      await prisma.classBooking.findMany({
        where: { status: "SCHEDULED", scheduledAt: { gte: today.start, lt: today.end } },
        select: { studentId: true },
      })
    ).map((b) => b.studentId),
  );

  let sent = 0;
  for (const user of users) {
    if (!user.lastActivityDate) continue;
    if (hasClassToday.has(user.id)) continue;
    const gap = daysSince(user.lastActivityDate, now);
    if (!REMINDER_TRIGGER_DAYS.includes(gap)) continue;

    await createNotification({
      userId: user.id,
      type: "PRACTICE_REMINDER",
      title: "Time for a practice session?",
      body: `It's been ${gap} day${gap === 1 ? "" : "s"} since your last practice. Pick up where you left off.`,
      emailCategory: "reminders",
    });
    sent++;
  }

  console.log(`Practice reminders: sent ${sent} of ${users.length} eligible users`);
  return { statusCode: 200 };
}));
