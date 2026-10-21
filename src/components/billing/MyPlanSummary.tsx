import Link from "next/link";
import { classesLeftInPaidMonth, getActivePaymentPlan, getFifthClassOffer } from "@/lib/paymentPlans";
import { describePaymentPlan } from "@/lib/classCreditPricing";
import { formatEtDateTime } from "@/lib/classScheduleLabels";

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const dateOnly = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });

/**
 * "My plan" in plain words: what they are on, when the next bill is and how much, how many classes are left this cycle, and the
 * one thing worth doing about it (the optional fifth class, or a longer plan that includes it). Shown on Lessons and on the
 * plan page. Renders nothing without an active plan.
 */
export async function MyPlanSummary({ userId }: { userId: string }) {
  const plan = await getActivePaymentPlan(userId);
  if (!plan) return null;
  const [left, fifth] = await Promise.all([classesLeftInPaidMonth(plan), getFifthClassOffer(userId).catch(() => null)]);
  const due = plan.nextDueDate;
  const daysToDue = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  const overdue = daysToDue < 0;

  return (
    <section className="glass-surface mb-4 p-4" aria-label="My plan">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">My plan</p>
          <p className="mt-1 text-body font-semibold text-slate-50">{describePaymentPlan(plan.cadence, plan.term)}</p>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-small">
          <div>
            <dt className="text-slate-500">{overdue ? "Bill was due" : "Next bill"}</dt>
            <dd className={`font-semibold ${overdue ? "text-red-300" : "text-slate-50"}`}>
              {usd(plan.installmentAmountCents)} · {dateOnly(due)}
              <span className="ml-1.5 font-normal text-slate-400">{overdue ? "pay now to keep your classes" : daysToDue === 0 ? "today" : daysToDue === 1 ? "tomorrow" : `in ${daysToDue} days`}</span>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Classes left this cycle</dt>
            <dd className="font-semibold text-slate-50">{left}</dd>
          </div>
        </dl>
      </div>
      {fifth ? (
        <p className="mt-3 text-small text-slate-300">
          This cycle holds a fifth class on {formatEtDateTime(fifth.scheduledAt)}.{" "}
          <Link href="/lessons?tab=extra" className="font-semibold text-signal underline-offset-4 hover:underline">
            Add it for {usd(fifth.priceCents)}
          </Link>
        </p>
      ) : plan.term === "MONTHLY" ? (
        <p className="mt-3 text-small text-slate-400">
          A 3-month or 6-month plan includes the fifth class in the months that have one, at no extra cost.{" "}
          <Link href="/billing/plans" className="font-semibold text-slate-200 underline-offset-4 hover:underline">
            See plans
          </Link>
        </p>
      ) : null}
    </section>
  );
}
