import { schedule } from "@netlify/functions";
import { findStoppedJobs, runJob } from "../../src/lib/jobRun";
import { prisma } from "../../src/lib/prisma";
import { OWNER_EMAIL } from "../../src/lib/adminNotifications";
import { todayBoundsEt } from "../../src/lib/classSchedule";
import { sendNotificationEmailWithCta, getAppUrl } from "../../src/lib/email";
import { countUnmatchedReceipts, getPaymentPipelineHealth } from "../../src/lib/paymentPipelineStatus";

const HOUR_MS = 60 * 60 * 1000;

function count(n: number, one: string, many: string): string | null {
  return n > 0 ? `${n} ${n === 1 ? one : many}` : null;
}

// One short email to the owner, only on days something needs a decision.
// Runs once daily at 12:00 UTC (8am Eastern). Plain queries on purpose: this
// runs outside Next, so it must not pull in anything that needs the request
// cache (see the other scheduled functions).
export const handler = schedule("0 12 * * *", async () =>
  runJob("admin-daily-summary", async () => {
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

  const parts = [
    count(pendingPayments, "payment waiting for review", "payments waiting for review"),
    count(uncheckedAuto, "auto-approved payment to check", "auto-approved payments to check"),
    count(unmatchedEmails, "payment email that matched no one", "payment emails that matched no one"),
    count(applications, "class application to review", "class applications to review"),
    count(openChats, "open support chat", "open support chats"),
    count(unmarked, "finished class with no attendance marked", "finished classes with no attendance marked"),
    stoppedJobs.length ? `Scheduled ${stoppedJobs.length === 1 ? "job has" : "jobs have"} stopped: ${stoppedJobs.join(", ")}` : null,
    pipelineQuiet ? "No bank or Venmo email has arrived in two days while payments are waiting, check the Gmail script" : null,
  ].filter((p): p is string => p !== null);

  if (parts.length === 0 && !classLine) {
    console.log("Admin daily summary: nothing needs a decision, no email sent");
    return { statusCode: 200 };
  }

  await sendNotificationEmailWithCta(
    OWNER_EMAIL,
    "Today's to-do",
    [classLine, parts.length ? `${parts.join(". ")}.` : null].filter(Boolean).join(" "),
    { label: "Open admin", url: getAppUrl("/admin") },
  );
  console.log(`Admin daily summary: sent (${parts.length} items, ${classesToday.length} classes)`);
  return { statusCode: 200 };
}));
