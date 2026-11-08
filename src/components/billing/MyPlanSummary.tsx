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
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {paused ? (
            <p className="text-title font-semibold text-amber-300">Paused</p>
          ) : (
            <p className={`text-headline font-semibold tabular-nums ${overdue ? "text-red-300" : "text-slate-50"}`}>{usd(plan.installmentAmountCents)}</p>
          )}
          <p className={`text-small ${overdue ? "font-medium text-red-300" : "text-slate-400"}`}>
            {paused
              ? pausedText.replace("Paused until the studio resumes it", "Until the studio resumes it").replace("Paused until ", "Until ")
              : overdue
                ? `Was due ${dateOnly(due)}`
                : `${dateOnly(due)} · ${daysToDue === 0 ? "today" : daysToDue === 1 ? "tomorrow" : `in ${daysToDue} days`}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-headline font-semibold tabular-nums text-slate-50">{left}</p>
          <p className="text-small text-slate-500">{left === 1 ? "class left" : "classes left"}</p>
        </div>
      </div>
      <div aria-hidden className="mt-4 flex gap-1">
        {Array.from({ length: Math.min(plan.termMonths, 12) }, (_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < plan.installmentsPaid ? "bg-signal" : "bg-slate-50/10"}`} />
        ))}
      </div>
      <p className="mt-2 text-caption text-slate-500">
        {describePaymentPlan(plan.cadence, plan.term)} · {plan.installmentsPaid}/{plan.termMonths} paid
      </p>
    </section>
  );
}
