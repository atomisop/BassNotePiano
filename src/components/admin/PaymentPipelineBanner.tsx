import { describeAge, type PaymentPipelineHealth } from "@/lib/paymentPipelineStatus";

/**
 * One line that says whether bank and Venmo emails are still arriving. It
 * turns into a warning when payments are waiting and none has come for two
 * days: the Gmail script that reads them has probably stopped, and nothing
 * else in the app would say so.
 */
export function PaymentPipelineBanner({ health }: { health: PaymentPipelineHealth }) {
  if (health.status === "quiet") {
    const silence = health.hoursSinceEmail === null ? "has ever arrived" : `has arrived for ${Math.max(2, Math.floor(health.hoursSinceEmail / 24))} days`;
    return (
      <div role="alert" className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-small text-amber-200">
        <p className="font-semibold">Bank and Venmo emails may have stopped.</p>
        <p className="mt-1">
          No payment email {silence}, but {health.waitingPayments} payment{health.waitingPayments === 1 ? " is" : "s are"} waiting. The
          Gmail script that reads them may have stopped. Open script.google.com, choose Triggers (the clock), and check that{" "}
          <span className="font-mono">forwardPaymentEmails</span> is still running.
        </p>
      </div>
    );
  }
  return (
    <p className="mt-6 text-small text-slate-500">
      Bank and Venmo emails: the last one arrived {describeAge(health.hoursSinceEmail)}.
    </p>
  );
}
