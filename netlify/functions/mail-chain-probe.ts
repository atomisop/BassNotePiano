import { schedule } from "@netlify/functions";
import { runJob } from "../../src/lib/jobRun";
import { sendMailChainProbe } from "../../src/lib/email";
import { newProbeToken, recordProbeSent } from "../../src/lib/mailProbe";

// Once a day: send a test email to music@. If it makes it through
// Squarespace, Gmail, Mailgun and the site, the inbound route records it;
// if not, the watchdog (every 30 minutes) tells the owner.
// The job body is exported so the catch-up (src/lib/jobCatchUp.ts) can run it when a scheduled run was missed.
export const runMailChainProbe = () =>
  runJob("mail-chain-probe", async () => {
    const token = newProbeToken();
    await sendMailChainProbe(token);
    await recordProbeSent(token);
    return { statusCode: 200 };
  });

export const handler = schedule("0 13 * * *", async () => runMailChainProbe());
