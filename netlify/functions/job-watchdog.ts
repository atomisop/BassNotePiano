import { schedule } from "@netlify/functions";
import { getJobStatuses, runJob } from "../../src/lib/jobRun";
import { prisma } from "../../src/lib/prisma";
import { OWNER_EMAIL } from "../../src/lib/adminNotifications";
import { sendNotificationEmailWithCta, getAppUrl } from "../../src/lib/email";
import { pingMonitor, problemsFromStatuses, runWatchdog } from "../../src/lib/jobWatchdog";

const ALERT_ROW = "watchdog-alert";

// Every 30 minutes. Looks for stopped scheduled jobs, emails the owner at
// once (not only in the morning summary), and pings an outside monitor
// (HEALTHCHECK_PING_URL, free at healthchecks.io) so a dead watchdog, a dead
// database or a dead site is noticed from outside. Plain queries on purpose:
// this runs outside Next, like the other scheduled functions.
export const handler = schedule("*/30 * * * *", async () =>
  runJob("job-watchdog", async () => {
    const result = await runWatchdog({
      findProblems: async () => problemsFromStatuses(await getJobStatuses()),
      getLastAlert: () => prisma.jobRun.findFirst({ where: { name: ALERT_ROW }, orderBy: { ranAt: "desc" }, select: { note: true, ranAt: true } }),
      recordAlert: async (note) => {
        await prisma.jobRun.create({ data: { name: ALERT_ROW, ok: true, note: note.slice(0, 1000) } });
      },
      sendEmail: (subject, body) => sendNotificationEmailWithCta(OWNER_EMAIL, subject, body, { label: "Open admin", url: getAppUrl("/admin") }),
      ping: (problems) => pingMonitor(process.env.HEALTHCHECK_PING_URL, problems),
    });
    console.log(`Job watchdog: ${result.problems.length} problem(s)${result.alerted ? ", alert sent" : ""}${result.recovered ? ", recovery sent" : ""}`);
    return { statusCode: 200 };
  }),
);
