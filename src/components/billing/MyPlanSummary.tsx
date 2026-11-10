import Link from "next/link";
import { classesLeftInPaidMonth, getActivePaymentPlan } from "@/lib/paymentPlans";
import { describePaymentPlan } from "@/lib/classCreditPricing";
import { isIndefinitePause, isPausedNow } from "@/lib/planPause";
import { Fact, Facts, Meta } from "@/components/ui/CardKit";
import { StatusDot } from "@/components/ui/StatusDot";
import { ChevronRight } from "@/components/ui/appIcons";

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const dateOnly = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });

/**
 * "My plan" in plain words. On the plan page (`card`) it says one thing loudly, the next bill (its amount, with the date under it),
 * and keeps the rest small: classes left and bills paid as two facts, the plan's name as the eyebrow. On Lessons (`row`) it is one
 * quiet line that opens the plan page, because there the next class is the screen's hero. Renders nothing without an active plan.
 */
export async function MyPlanSummary({ userId, variant = "card" }: { userId: string; variant?: "card" | "row" }) {
  const plan = await getActivePaymentPlan(userId);
  if (!plan) return null;
  const left = await classesLeftInPaidMonth(plan);
  const due = plan.nextDueDate;
  const daysToDue = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  const overdue = daysToDue < 0;
  const paused = isPausedNow(plan, new Date());
  const pausedText = isIndefinitePause(plan) || !plan.pauseUntil ? "Until the studio resumes it" : `Until ${dateOnly(plan.pauseUntil)}`;
  const when = daysToDue === 0 ? "today" : daysToDue === 1 ? "tomorrow" : `in ${daysToDue} days`;
  const classesLeft = `${left} ${left === 1 ? "class" : "classes"} left`;

  if (variant === "row") {
    return (
      <section aria-label="My plan" className="mx-auto mb-4 w-full max-w-wide">
      <Link
        href="/billing/plans"
        className="group flex w-full items-center justify-between gap-3 rounded-card bg-neu-base px-4 py-3 shadow-raised-low transition hover:shadow-raised-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0">
          <span className="block truncate text-small font-medium text-slate-100">{describePaymentPlan(plan.cadence, plan.term)}</span>
          <Meta
            className="truncate"
            items={[
              paused ? (
                <span className="text-amber-300">Paused</span>
              ) : overdue ? (
                <span className="text-red-400">Bill was due {dateOnly(due)}</span>
              ) : (
                `Next bill ${usd(plan.installmentAmountCents)} ${dateOnly(due)}`
              ),
              classesLeft,
            ]}
          />
        </span>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
      </Link>
      </section>
    );
  }

  return (
    <section className="mb-4 rounded-card bg-neu-base p-5 shadow-raised-mid" aria-label="My plan">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption font-medium uppercase tracking-caps text-slate-500">{describePaymentPlan(plan.cadence, plan.term)}</p>
          {/* The one loud thing: what the next bill is, or that the plan is paused. */}
          {paused ? (
            <p className="mt-1 text-headline font-semibold text-slate-50">Paused</p>
          ) : (
            <p className={`mt-1 text-headline font-semibold tabular-nums ${overdue ? "text-red-300" : "text-slate-50"}`}>{usd(plan.installmentAmountCents)}</p>
          )}
          <p className={`mt-0.5 text-small ${overdue ? "font-medium text-red-300" : "text-slate-400"}`}>
            {paused ? pausedText : overdue ? `Next bill was due ${dateOnly(due)}` : `Next bill ${dateOnly(due)}, ${when}`}
          </p>
        </div>
        {(overdue || paused) && (
          <div className="shrink-0 pt-0.5">{overdue ? <StatusDot tone="danger">Overdue</StatusDot> : <StatusDot tone="warning">Paused</StatusDot>}</div>
        )}
      </div>
      <Facts columns={2} className="mt-4 border-t border-slate-50/8 pt-4">
        <Fact label="This cycle" value={classesLeft} tone={left > 0 ? "default" : "muted"} />
        <Fact label="Bills paid" value={`${plan.installmentsPaid} of ${plan.termMonths}`} />
      </Facts>
    </section>
  );
}
