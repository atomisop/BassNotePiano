import { schedule } from "@netlify/functions";
import { createNotification } from "../../src/lib/notifications";
import { expireDueCreditGrants } from "../../src/lib/creditLedger";

// Runs daily at 09:00 UTC — off-hours, and deliberately ahead of
// payment-plan-reservations.ts (09:30) so a plan whose final cycle's
// credits expire this same morning is evaluated by that job with its grant
// already marked expired, not a stale "still live" read from earlier in the
// day. Also ahead of payment-plan-installments.ts (16:00), which is
// unrelated but staggered the same way practice-reminders.ts (15:00) and
// payment-plan-installments.ts already are.
export const handler = schedule("0 9 * * *", async () => {
  const summaries = await expireDueCreditGrants();

  for (const summary of summaries) {
    await createNotification({
      userId: summary.userId,
      type: "CREDITS_EXPIRED",
      title: "Unused credits expired",
      body: `${summary.creditsExpired} class credit${summary.creditsExpired === 1 ? "" : "s"} expired at the end of its paid cycle.`,
      emailCategory: "payments",
    }).catch((err) => console.error(`CREDITS_EXPIRED notification failed for user ${summary.userId} (non-blocking):`, err));
  }

  const totalCredits = summaries.reduce((sum, s) => sum + s.creditsExpired, 0);
  console.log(`Credit expiry: expired ${summaries.length} grant(s), totaling ${totalCredits} credit(s).`);
  return { statusCode: 200 };
});
