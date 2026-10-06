import { schedule } from "@netlify/functions";
import { runJob } from "../../src/lib/jobRun";
import { prisma } from "../../src/lib/prisma";
import { OWNER_EMAIL } from "../../src/lib/adminNotifications";
import { todayBoundsEt } from "../../src/lib/classSchedule";
import { sendNotificationEmailWithCta, getAppUrl } from "../../src/lib/email";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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
  const [pendingPayments, uncheckedAuto, unmatchedEmails, applications, openChats, classesToday] = await Promise.all([
    prisma.zellePayment.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.zellePayment.count({ where: { autoApproved: true, checkedAt: null, status: "VERIFIED" } }),
    // A payment email that matched nobody an hour later, from the last week.
    prisma.processedPaymentEmail.count({
      where: { paymentId: null, createdAt: { lt: new Date(now - HOUR_MS), gt: new Date(now - 7 * DAY_MS) } },
    }),
    prisma.classRegistration.count({ where: { status: "PENDING" } }),
    prisma.assistantEscalation.count({ where: { status: "OPEN" } }),
    prisma.classBooking.findMany({
      where: { status: "SCHEDULED", scheduledAt: { gte: today.start, lt: today.end } },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true, student: { select: { name: true, email: true } } },
    }),
  ]);

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
