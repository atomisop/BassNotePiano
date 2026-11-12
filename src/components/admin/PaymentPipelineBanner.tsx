import { describeAge, type PaymentPipelineHealth } from "@/lib/paymentPipelineStatus";
import { Callout } from "@/components/ui/CardKit";

/**
 * One line that says whether bank emails are still arriving. It
 * turns into a warning when payments are waiting and none has come for two
 * days: the Gmail script that reads them has probably stopped, and nothing
 * else in the app would say so.
 */
export function PaymentPipelineBanner({ health }: { health: PaymentPipelineHealth }) {
  if (health.status === "quiet") {
    const silence = health.hoursSinceEmail === null ? "has ever arrived" : `has arrived for ${Math.max(2, Math.floor(health.hoursSinceEmail / 24))} days`;
    return (
      <div role="alert" className="mt-6">
        <Callout tone="warning">
          <p className="font-semibold">Bank emails may have stopped.</p>
          <p className="mt-1 opacity-90">
            No payment email {silence}, but {health.waitingPayments} payment{health.waitingPayments === 1 ? " is" : "s are"} waiting. The
            Gmail script that reads them may have stopped. Open script.google.com, choose Triggers (the clock), and check that{" "}
            <span className="font-mono">forwardPaymentEmails</span> is still running.
          </p>
        </Callout>
      </div>
    );
  }
  return (
    <p className="mt-6 text-small text-slate-500">
      {health.hoursSinceEmail === null ? "No bank email has arrived yet. Payments match to bills by themselves once one does" : `Last bank email ${describeAge(health.hoursSinceEmail)}`}
    </p>
  );
}
