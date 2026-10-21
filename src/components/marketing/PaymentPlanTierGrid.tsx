"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { PaymentPlanCadence, PaymentPlanTerm } from "@prisma/client";
import {
  calculateFamilyBundleTotal,
  calculatePaymentPlanRate,
  DEFAULT_PRICING,
  type PricingConfig,
  MIN_FAMILY_BUNDLE_RECIPIENTS,
  PLAN_CADENCE_CREDITS_PER_WEEK,
  OFFERED_PLAN_CADENCE,
  CLASS_MINUTES,
} from "@/lib/classCreditPricing";
import { CheckIcon } from "@/components/ui/icons";
import { NumberTicker } from "@/components/ui/number-ticker";

const TERM_OPTIONS: { value: PaymentPlanTerm; label: string }[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "TERM_3", label: "3-Month" },
  { value: "TERM_6", label: "6-Month" },
];

/** The card that gets the animated border and the "Best value" badge (a marketing choice, not the lowest price). */
const FEATURED_TERM: PaymentPlanTerm = "TERM_3";

type Audience = "solo" | "family";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const gridContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const cardItem = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0, duration: 0.5 } },
};

/**
 * The plan cards on /pricing. Layout and the animated conic-gradient border
 * on the featured card are adapted from the "Scalable Pricing Table" on
 * 21st.dev (shadcnspace/pricing-02), restyled with this app's theme tokens.
 *
 * Every number comes from calculatePaymentPlanRate and
 * calculateFamilyBundleTotal, the same functions /billing/plans and
 * /billing/lessons compute off of, so this can't drift from the real price.
 * The Solo/Family switch reprices the same three terms: a family bundle is
 * the same cadence and term with an extra FAMILY_BUNDLE_DISCOUNT_RATE off
 * the combined total, so it is cheaper than the solo price at every term.
 */
export function PaymentPlanTierGrid({ pricing = DEFAULT_PRICING }: { pricing?: PricingConfig }) {
  // One plan on offer: a 45-minute class a week.
  const cadence: PaymentPlanCadence = OFFERED_PLAN_CADENCE;
  const [audience, setAudience] = useState<Audience>("solo");
  const monthlyBaseline = calculatePaymentPlanRate(cadence, "MONTHLY", pricing).installmentAmountCents;
  const isFamily = audience === "family";

  return (
    <div>
      <div className="mx-auto mb-8 flex flex-col items-center gap-3">
        <Segmented
          label="Who is learning"
          value={audience}
          onChange={(v) => setAudience(v as Audience)}
          options={[
            { value: "solo", label: "Just me" },
            { value: "family", label: `Family (${MIN_FAMILY_BUNDLE_RECIPIENTS}+ students)` },
          ]}
        />
        {isFamily && (
          <p className="text-small text-slate-400">
            Extra {Math.round(pricing.familyDiscountRate * 100)}% off every plan below, per student.
          </p>
        )}
      </div>

      <motion.div
        // No `key` on purpose: the cards stay mounted when you flip Solo/Family
        // or the weekly length, so only the numbers change (they count).
        variants={gridContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3"
      >
        {TERM_OPTIONS.map((option) => {
          const rate = calculatePaymentPlanRate(cadence, option.value, pricing);
          const family = calculateFamilyBundleTotal(cadence, option.value, MIN_FAMILY_BUNDLE_RECIPIENTS, pricing);
          const isMonthly = option.value === "MONTHLY";
          const featured = option.value === FEATURED_TERM;

          const perStudentCents = isFamily ? family.perStudentMonthlyCents : rate.installmentAmountCents;
          const classesPerMonth = rate.creditsPerInstallment / PLAN_CADENCE_CREDITS_PER_WEEK[cadence];
          const percentOff = Math.round((1 - perStudentCents / monthlyBaseline) * 100);

          const features: ReactNode[] = isFamily
            ? [
                <>
                  <NumberTicker value={classesPerMonth} /> live {CLASS_MINUTES}-minute classes a month, per student
                </>,
                "Each student's weekly time reserved",
                <>
                  Paid once for the whole term: <NumberTicker value={family.totalCents} format={formatUsd} /> for{" "}
                  <NumberTicker value={family.recipientCount} /> students
                </>,
              ]
            : [
                <>
                  <NumberTicker value={classesPerMonth} /> live {CLASS_MINUTES}-minute classes a month
                </>,
                "Your weekly time reserved",
                isMonthly ? (
                  "In a five-class-day month, add the fifth class at a member price"
                ) : (
                  "A free bonus class in any month with five of your class day"
                ),
                isMonthly ? (
                  "No commitment, pay month to month"
                ) : (
                  <>
                    Locked in for <NumberTicker value={rate.termMonths} /> months, paid monthly
                  </>
                ),
              ];

          return (
            <motion.div key={option.value} variants={cardItem} className={`relative flex flex-col ${featured ? "z-10 lg:-my-3 lg:scale-[1.05]" : ""}`}>
              <div
                className={`relative flex flex-1 flex-col gap-7 rounded-2xl p-7 sm:p-8 ${
                  featured
                    ? "bg-neu-base shadow-raised-high ring-2 ring-[rgb(var(--c-a-400))] shadow-[0_0_48px_-8px_rgb(var(--c-a-400)/0.55)]"
                    : "glass-surface opacity-90 transition hover:opacity-100 hover:shadow-raised-high"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-serif text-body text-slate-50">{option.label}</p>
                  {featured ? (
                    <span className="rounded-full bg-[rgb(var(--c-a-400))] px-3 py-1 text-small font-bold text-black">Best value</span>
                  ) : isMonthly && !isFamily ? (
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-small font-medium text-slate-300">No commitment</span>
                  ) : null}
                </div>

                <div>
                  <p className="h-5 text-small tabular-nums text-slate-500">
                    {percentOff > 0 && (
                      <span className="line-through">
                        <NumberTicker value={monthlyBaseline} format={formatUsd} />
                        /mo
                      </span>
                    )}
                    {percentOff > 0 && (
                      <span className="ml-2 rounded-full bg-slate-50 px-2 py-0.5 align-middle text-small font-bold text-slate-950">
                        −<NumberTicker value={percentOff} />%
                      </span>
                    )}
                  </p>
                  <p className="mt-1 flex items-baseline gap-1.5">
                    <span className={`font-serif text-hero tabular-nums ${featured ? "text-[rgb(var(--c-a-400))]" : "text-slate-50"}`}>
                      <NumberTicker value={perStudentCents} format={formatUsd} />
                    </span>
                    <span className="text-small text-slate-400">{isFamily ? "/student/mo" : "/month"}</span>
                  </p>
                </div>

                <div className="h-px w-full bg-ink/10" />

                <ul className="flex flex-1 flex-col gap-3.5">
                  {features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-small text-slate-300">
                      <CheckIcon size={16} className="mt-0.5 shrink-0 text-[rgb(var(--c-s-50))]" />
                      <span className="min-w-0">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={isFamily ? "/billing/plans" : `/billing/plans?cadence=${cadence}&term=${option.value}`}
                  className={`flex h-12 items-center justify-center rounded-xl text-small font-semibold transition ${
                    featured
                      ? "bg-[rgb(var(--c-a-400))] text-black shadow-raised-mid hover:brightness-110 active:shadow-pressed-low"
                      : "bg-neu-base text-slate-100 shadow-raised-low active:shadow-pressed-low hover:text-[rgb(var(--c-s-50))]"
                  }`}
                >
                  {isFamily ? "Bundle & save" : "Start plan"}
                </Link>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div role="group" aria-label={label} className="flex w-fit gap-1.5 rounded-full bg-neu-base p-1 shadow-pressed-low">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`tap rounded-full px-4 py-1.5 text-small font-medium transition ${
            value === option.value
              ? "bg-neu-base text-signal shadow-raised-low"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
