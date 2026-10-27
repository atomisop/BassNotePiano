import { schedule } from "@netlify/functions";
import { findStoppedJobs, runJob } from "../../src/lib/jobRun";
import { prisma } from "../../src/lib/prisma";
import { OWNER_EMAIL } from "../../src/lib/adminNotifications";
import { todayBoundsEt } from "../../src/lib/classSchedule";
import { sendNotificationEmailWithCta, sendTodoListEmail, getAppUrl, type TodoEmailItem } from "../../src/lib/email";
import { getBoolSetting } from "../../src/lib/siteSettings";
import { getFollowUps } from "../../src/lib/adminFollowUps";
import { countUnmatchedReceipts, getPaymentPipelineHealth } from "../../src/lib/paymentPipelineStatus";
import { getPaymentDigestFacts } from "../../src/lib/paymentDigest";

const HOUR_MS = 60 * 60 * 1000;

function count(n: number, one: string, many: string): string | null {
  return n > 0 ? `${n} ${n === 1 ? one : many}` : null;
}

// One short email to the owner on days something needs a decision, and a short
// "all clear" every Monday, so a quiet inbox means all is well rather than
// that this job (or the email service) stopped.
// Runs once daily at 12:00 UTC (8am Eastern). Plain queries on purpose: this
// runs outside Next, so it must not pull in anything that needs the request
// cache (see the other scheduled functions).
export const handler = schedule("0 12 * * *", async () =>
  runJob("admin-daily-summary", async () => {
  if (!(await getBoolSetting("reminders.adminDailySummary"))) {
    console.log("Admin daily summary: turned off in settings");
    return { statusCode: 200 };
  }
  const now = Date.now();
  const today = todayBoundsEt();
  const [pendingPayments, uncheckedAuto, unmatchedEmails, applications, openChats, classesToday, unmarked, stoppedJobs, pipeline, followUps, paymentFacts] = await Promise.all([
    prisma.zellePayment.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.zellePayment.count({ where: { autoApproved: true, checkedAt: null, status: "VERIFIED" } }),
    // Payment emails that matched nobody and nobody has dismissed (the same count the Overview shows).
    countUnmatchedReceipts(new Date(now)),
    prisma.classRegistration.count({ where: { status: "PENDING" } }),
    prisma.assistantEscalation.count({ where: { status: "OPEN" } }),
    prisma.classBooking.findMany({
      where: { status: "SCHEDULED", scheduledAt: { gte: today.start, lt: today.end } },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true, student: { select: { name: true, email: true } } },
    }),
    // Classes already over that have no attendance marked.
    prisma.classBooking.count({ where: { status: "SCHEDULED", scheduledAt: { lt: new Date(now - 3 * HOUR_MS) } } }),
    findStoppedJobs(new Date(now)),
    // Payments someone says they sent, with no bank email for two days: the Gmail script has probably stopped.
    getPaymentPipelineHealth(new Date(now)),
    getFollowUps(new Date(now)),
    getPaymentDigestFacts(new Date(now)).catch(() => ({ waitingOverDay: 0, likelyMatches: 0 })),
  ]);
  const pipelineQuiet = pipeline.status === "quiet";

  const classLine = classesToday.length
    ? `Teaching today: ${classesToday
        .map((c) => {
          const time = c.scheduledAt.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
          return `${time} ${c.student.name ?? c.student.email}`;
        })
        .join(", ")}.`
    : null;

  const item = (n: number, one: string, many: string, path: string): TodoEmailItem | null =>
    n > 0 ? { text: `${n} ${n === 1 ? one : many}`, url: getAppUrl(path) } : null;
  const parts = [
    item(pendingPayments, "payment waiting for review", "payments waiting for review", "/admin/payments"),
    item(uncheckedAuto, "auto-approved payment to check", "auto-approved payments to check", "/admin/payments?status=UNCHECKED"),
    item(unmatchedEmails, "payment email that matched no one", "payment emails that matched no one", "/admin/payments?tab=emails"),
    item(paymentFacts.likelyMatches, "of those already has a likely payment (one tap to approve)", "of those already have a likely payment (one tap each to approve)", "/admin/payments?tab=emails"),
    item(paymentFacts.waitingOverDay, "payment has waited for you more than a day", "payments have waited for you more than a day", "/admin/payments"),
    item(applications, "class application to review", "class applications to review", "/admin/students"),
    item(openChats, "open support chat", "open support chats", "/admin/support"),
    item(unmarked, "finished class with no attendance marked", "finished classes with no attendance marked", "/admin/schedule?view=ATTENDANCE"),
    stoppedJobs.length
      ? { text: `Scheduled ${stoppedJobs.length === 1 ? "job has" : "jobs have"} stopped: ${stoppedJobs.join(", ")}`, url: getAppUrl("/admin") }
      : null,
    pipelineQuiet
      ? { text: "No bank or Venmo email has arrived in two days while payments are waiting, check the Gmail script", url: getAppUrl("/admin/payments") }
      : null,
    // People to reach out to (overdue bills, students who stopped practicing, trials ending, credits about to lapse).
    ...followUps.map((f) => ({
      text: `${f.title}: ${f.people.length ? f.people.map((p) => p.name).join(", ") : `${f.total}`}${f.total > f.people.length && f.people.length ? ` and ${f.total - f.people.length} more` : ""}`,
      url: getAppUrl(f.href),
    })),
  ].filter((p): p is TodoEmailItem => p !== null);

  // Mondays: the week in numbers, added to whichever email goes out.
  const isMonday = new Date(now).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long" }) === "Monday";
  let digest: string | null = null;
  if (isMonday) {
    const weekAgo = new Date(now - 7 * 24 * HOUR_MS);
    const [signups, revenue, taught, noShows, newPlans] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.zellePayment.aggregate({ where: { status: "VERIFIED", reviewedAt: { gte: weekAgo } }, _sum: { amountCents: true } }),
      prisma.classBooking.count({ where: { status: "COMPLETED", scheduledAt: { gte: weekAgo } } }),
      prisma.classBooking.count({ where: { attendance: "NO_SHOW", scheduledAt: { gte: weekAgo } } }),
      prisma.paymentPlan.count({ where: { createdAt: { gte: weekAgo } } }),
    ]);
    digest = `Last 7 days: ${signups} new ${signups === 1 ? "account" : "accounts"}, ${newPlans} new ${newPlans === 1 ? "plan" : "plans"}, $${((revenue._sum.amountCents ?? 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} verified, ${taught} ${taught === 1 ? "class" : "classes"} taught, ${noShows} no-${noShows === 1 ? "show" : "shows"}.`;
  }

  if (parts.length === 0 && !classLine) {
    if (!isMonday) {
      console.log("Admin daily summary: nothing needs a decision, no email sent");
      return { statusCode: 200 };
    }
    await sendNotificationEmailWithCta(
      OWNER_EMAIL,
      "All clear",
      `${digest ? `${digest} ` : ""}Weekly check-in: nothing needs a decision, every scheduled job has run on time, and payment emails are arriving. If you stop getting this on Mondays, something is wrong with the scheduler or the email service.`,
      { label: "Open admin", url: getAppUrl("/admin") },
    );
    console.log("Admin daily summary: all clear sent");
    return { statusCode: 200 };
  }

  await sendTodoListEmail(OWNER_EMAIL, "Today's to-do", [classLine, digest].filter(Boolean).join(" ") || null, parts);
  console.log(`Admin daily summary: sent (${parts.length} items, ${classesToday.length} classes)`);
  return { statusCode: 200 };
}));
