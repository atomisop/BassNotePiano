import { schedule } from "@netlify/functions";
import { runJob } from "../../src/lib/jobRun";
import { createNotification } from "../../src/lib/notifications";
import { expireDueCreditGrants, warnExpiringSoonCreditGrants } from "../../src/lib/creditLedger";

// Runs daily at 09:00 UTC — off-hours, and deliberately ahead of
// payment-plan-reservations.ts (09:30) so a plan whose final cycle's
// credits expire this same morning is evaluated by that job with its grant
// already marked expired, not a stale "still live" read from earlier in the
// day. Also ahead of payment-plan-installments.ts (16:00), which is
// unrelated but staggered the same way practice-reminders.ts (15:00) and
// payment-plan-installments.ts already are.
//
// Two phases, same "upcoming, then overdue" shape payment-plan-
// installments.ts already uses for its own due/overdue reminders — mutually
// exclusive by construction (a grant's expiresAt is either still in the
// future, the warning phase's whole domain, or already past, the sweep
// phase's), so the two never double up on the same grant in one run.
export const handler = schedule("0 9 * * *", async () =>
  runJob("credit-expiry", async () => {
  // One shared instant for both phases (rather than each defaulting its own
  // `now` independently a few lines apart) — keeps "expiring soon" and
  // "expired" strictly non-overlapping even at the exact millisecond a
  // grant's expiresAt falls between the two calls, not just almost always.
  const now = new Date();

  const warned = await warnExpiringSoonCreditGrants(now);
  for (const summary of warned) {
    const daysLeft = Math.max(1, Math.round((summary.expiresAt.getTime() - now.getTime()) / 86_400_000));
    await createNotification({
      userId: summary.userId,
      type: "CREDITS_EXPIRING_SOON",
      title: "Unused credits expiring soon",
      body: `${summary.creditsRemaining} class credit${summary.creditsRemaining === 1 ? "" : "s"} from your payment plan ${
        summary.creditsRemaining === 1 ? "expires" : "expire"
      } in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Book a class before then to use ${summary.creditsRemaining === 1 ? "it" : "them"}.`,
      emailCategory: "payments",
    }).catch((err) => console.error(`CREDITS_EXPIRING_SOON notification failed for user ${summary.userId} (non-blocking):`, err));
  }

  const expired = await expireDueCreditGrants(now);
  for (const summary of expired) {
    await createNotification({
      userId: summary.userId,
      type: "CREDITS_EXPIRED",
      title: "Unused credits expired",
      body: `${summary.creditsExpired} class credit${summary.creditsExpired === 1 ? "" : "s"} expired at the end of its paid cycle.`,
      emailCategory: "payments",
    }).catch((err) => console.error(`CREDITS_EXPIRED notification failed for user ${summary.userId} (non-blocking):`, err));
  }

  const totalExpired = expired.reduce((sum, s) => sum + s.creditsExpired, 0);
  console.log(
    `Credit expiry: warned ${warned.length} grant(s) expiring soon, expired ${expired.length} grant(s) totaling ${totalExpired} credit(s).`,
  );
  return { statusCode: 200 };
}));
