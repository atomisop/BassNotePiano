import { classesLeftInPaidMonth, getActivePaymentPlan } from "@/lib/paymentPlans";
import { describePaymentPlan } from "@/lib/classCreditPricing";
import { isIndefinitePause, isPausedNow } from "@/lib/planPause";

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const dateOnly = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });

/**
 * "My plan" in plain words: what they are on, when the next bill is and how much, and how many classes are left this cycle. Shown on
 * Lessons and on the plan page. Renders nothing without an active plan.
 */
export async function MyPlanSummary({ userId }: { userId: string }) {
  const plan = await getActivePaymentPlan(userId);
  if (!plan) return null;
  const left = await classesLeftInPaidMonth(plan);
  const due = plan.nextDueDate;
  const daysToDue = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  const overdue = daysToDue < 0;
  const paused = isPausedNow(plan, new Date());
  const pausedText = isIndefinitePause(plan) || !plan.pauseUntil ? "Paused until the studio resumes it" : `Paused until ${dateOnly(plan.pauseUntil)}`;

  return (
    <section className="glass-surface mb-4 p-4" aria-label="My plan">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">My plan</p>
          <p className="mt-1 text-body font-semibold text-slate-50">{describePaymentPlan(plan.cadence, plan.term)}</p>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-small">
          {paused ? (
            <div>
              <dt className="text-slate-500">Plan</dt>
              <dd className="font-semibold text-amber-300">{pausedText}</dd>
            </div>
          ) : (
          <div>
            <dt className="text-slate-500">{overdue ? "Bill was due" : "Next bill"}</dt>
            <dd className={`font-semibold ${overdue ? "text-red-300" : "text-slate-50"}`}>
              {usd(plan.installmentAmountCents)} · {dateOnly(due)}
              <span className="ml-1.5 font-normal text-slate-400">{overdue ? "pay now to keep your classes" : daysToDue === 0 ? "today" : daysToDue === 1 ? "tomorrow" : `in ${daysToDue} days`}</span>
            </dd>
          </div>
          )}
          <div>
            <dt className="text-slate-500">Classes left this cycle</dt>
            <dd className="font-semibold text-slate-50">{left}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
