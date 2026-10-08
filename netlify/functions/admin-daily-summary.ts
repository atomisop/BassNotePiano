import { schedule } from "@netlify/functions";
import { findStoppedJobs, runJob } from "../../src/lib/jobRun";
import { prisma } from "../../src/lib/prisma";
import { OWNER_EMAIL } from "../../src/lib/adminNotifications";
import { todayBoundsEt } from "../../src/lib/classSchedule";
import { sendNotificationEmailWithCta, sendTodoListEmail, getAppUrl, type TodoEmailItem } from "../../src/lib/email";
import { getBoolSetting } from "../../src/lib/siteSettings";
import { countUnmatchedReceipts, getPaymentPipelineHealth } from "../../src/lib/paymentPipelineStatus";

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
  const [pendingPayments, uncheckedAuto, unmatchedEmails, applications, openChats, classesToday, unmarked, stoppedJobs, pipeline] = await Promise.all([
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
    item(applications, "class application to review", "class applications to review", "/admin/students"),
    item(openChats, "open support chat", "open support chats", "/admin/support"),
    item(unmarked, "finished class with no attendance marked", "finished classes with no attendance marked", "/admin/schedule?view=ATTENDANCE"),
    stoppedJobs.length
      ? { text: `Scheduled ${stoppedJobs.length === 1 ? "job has" : "jobs have"} stopped: ${stoppedJobs.join(", ")}`, url: getAppUrl("/admin") }
      : null,
    pipelineQuiet
      ? { text: "No bank or Venmo email has arrived in two days while payments are waiting, check the Gmail script", url: getAppUrl("/admin/payments") }
      : null,
  ].filter((p): p is TodoEmailItem => p !== null);

  if (parts.length === 0 && !classLine) {
    const isMonday = new Date(now).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long" }) === "Monday";
    if (!isMonday) {
      console.log("Admin daily summary: nothing needs a decision, no email sent");
      return { statusCode: 200 };
    }
    await sendNotificationEmailWithCta(
      OWNER_EMAIL,
      "All clear",
      "Weekly check-in: nothing needs a decision, every scheduled job has run on time, and payment emails are arriving. If you stop getting this on Mondays, something is wrong with the scheduler or the email service.",
      { label: "Open admin", url: getAppUrl("/admin") },
    );
    console.log("Admin daily summary: all clear sent");
    return { statusCode: 200 };
  }

  await sendTodoListEmail(OWNER_EMAIL, "Today's to-do", classLine, parts);
  console.log(`Admin daily summary: sent (${parts.length} items, ${classesToday.length} classes)`);
  return { statusCode: 200 };
}));
