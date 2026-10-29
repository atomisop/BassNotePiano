"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { MorphingSquare } from "@/components/ui/morphing-square";
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
  discountedPlanPriceCents,
} from "@/lib/classCreditPricing";
import { CheckIcon } from "@/components/ui/icons";
import { NumberTicker } from "@/components/ui/number-ticker";
import { SnapCarousel } from "@/components/ui/SnapCarousel";

const TERM_OPTIONS: { value: PaymentPlanTerm; label: string }[] = [
  { value: "MONTHLY", label: "1 Month" },
  { value: "TERM_3", label: "3 Months" },
  { value: "TERM_6", label: "6 Months" },
];

/** The card that gets the animated border and the "Best value" badge (a marketing choice, not the lowest price). */
const FEATURED_TERM: PaymentPlanTerm = "TERM_3";

const FEATURED_INDEX = Math.max(0, TERM_OPTIONS.findIndex((o) => o.value === FEATURED_TERM));

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
 * The Solo/Group switch reprices the same three terms: a group bundle is
 * the same cadence and term with an extra FAMILY_BUNDLE_DISCOUNT_RATE off
 * the combined total, so it is cheaper than the solo price at every term.
 */
/**
 * Signed-in use (Settings > Membership): `switchTo` turns each card's button into "Switch to <plan>" and marks the plan the person is
 * on. `personalDiscountPercent` is the owner's discount on THIS account's solo price, taken off the same way the server charges it.
 */
export interface TierGridSwitch {
  /** The plan the person is on, or null when it is a retired length (no card is marked). */
  currentTerm: PaymentPlanTerm | null;
  /** The plan being switched to right now (its button shows the loader). */
  pendingTerm: PaymentPlanTerm | null;
  onSwitch: (term: PaymentPlanTerm) => void;
}

export function PaymentPlanTierGrid({
  pricing = DEFAULT_PRICING,
  personalDiscountPercent = 0,
  switchTo,
  narrow = false,
}: {
  pricing?: PricingConfig;
  personalDiscountPercent?: number;
  switchTo?: TierGridSwitch;
  /** For a column that is not the full page (Settings): dense cards, all three side by side whenever the column is wide enough, the swipe carousel only when it is not. */
  narrow?: boolean;
}) {
  // One plan on offer: a 45-minute class a week.
  const cadence: PaymentPlanCadence = OFFERED_PLAN_CADENCE;
  const [audience, setAudience] = useState<Audience>("solo");
  const solo = (cents: number) => (personalDiscountPercent > 0 ? discountedPlanPriceCents(cents, personalDiscountPercent) : cents);
  const monthlyBaseline = solo(calculatePaymentPlanRate(cadence, "MONTHLY", pricing).installmentAmountCents);
  const isFamily = audience === "family" && !switchTo;

  // One plan card. It is built once for the swipe carousel (phones) and once for the side-by-side grid (lg and up), never one
  // element placed in two spots, so each place gets its own copy.
  function renderCard(option: (typeof TERM_OPTIONS)[number]): { featured: boolean; node: ReactNode } {
    const rate = calculatePaymentPlanRate(cadence, option.value, pricing);
    const family = calculateFamilyBundleTotal(cadence, option.value, MIN_FAMILY_BUNDLE_RECIPIENTS, pricing);
    const isMonthly = option.value === "MONTHLY";
    const featured = option.value === FEATURED_TERM;

    const perStudentCents = isFamily ? family.perStudentMonthlyCents : solo(rate.installmentAmountCents);
    const classesPerMonth = rate.creditsPerInstallment / PLAN_CADENCE_CREDITS_PER_WEEK[cadence];
    const percentOff = Math.round((1 - perStudentCents / monthlyBaseline) * 100);

    const features: ReactNode[] = isFamily
      ? [
          <>
            <NumberTicker value={classesPerMonth} /> live {CLASS_MINUTES}-minute classes every 28&nbsp;days, per student
          </>,
          "Each student's weekly time reserved",
          isMonthly ? (
            "No commitment, pay every 28\u00a0days"
          ) : (
            <>
              Whole plan: <NumberTicker value={perStudentCents * rate.termMonths} format={formatUsd} /> per student, over{" "}
              <NumberTicker value={rate.termMonths} /> payments
            </>
          ),
        ]
      : [
          <>
            <NumberTicker value={classesPerMonth} /> live {CLASS_MINUTES}-minute classes every 28&nbsp;days
          </>,
          "Your weekly time reserved",
          isMonthly ? (
            "No commitment, pay every 28\u00a0days"
          ) : (
            <>
              Locked in for <NumberTicker value={rate.termMonths * 28} /> days, paid every 28&nbsp;days
            </>
          ),
          ...(isMonthly ? [] : [<>Whole plan: <NumberTicker value={perStudentCents * rate.termMonths} format={formatUsd} /></>]),
        ];

    return {
      featured,
      node: (
          <div
            className={`relative flex flex-1 flex-col ${narrow ? "gap-4 p-4" : "gap-7 p-7 sm:p-8"} rounded-2xl ${
              featured
                ? "bg-neu-base shadow-raised-high ring-2 ring-amber-400 shadow-[0_0_48px_-8px_rgb(var(--c-a-400)/0.55)]"
                : "glass-surface opacity-90 transition hover:opacity-100 hover:shadow-raised-high"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="font-serif text-body text-slate-50">{option.label}</p>
              {featured ? (
                <span className="rounded-full bg-amber-400 px-3 py-1 text-small font-bold text-black">Best value</span>
              ) : isMonthly && !isFamily && !narrow ? (
                <span className="rounded-full bg-slate-800 px-3 py-1 text-small font-medium text-slate-300">No commitment</span>
              ) : null}
            </div>
    
            <div>
              <p className={`text-small tabular-nums text-slate-500 ${narrow ? "min-h-5" : "h-5"}`}>
                {percentOff > 0 && (
                  <span className="line-through">
                    <NumberTicker value={monthlyBaseline} format={formatUsd} />
                    /28 days
                  </span>
                )}
                {percentOff > 0 && (
                  <span className="ml-2 rounded-full bg-slate-50 px-2 py-0.5 align-middle text-small font-bold text-slate-950">
                    −<NumberTicker value={percentOff} />%
                  </span>
                )}
              </p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className={`font-serif tabular-nums ${narrow ? "text-headline leading-none" : "text-hero"} ${featured ? "text-amber-400" : "text-slate-50"}`}>
                  <NumberTicker value={perStudentCents} format={formatUsd} />
                </span>
                <span className="text-small text-slate-400">{isFamily ? "/student per 28 days" : "/28 days"}</span>
              </p>
            </div>
    
            <div className="h-px w-full bg-ink/10" />
    
            <ul className="flex flex-1 flex-col gap-3.5">
              {features.map((feature, i) => (
                <li key={i} className="flex items-start gap-3 text-small text-slate-300">
                  <CheckIcon size={16} className="mt-0.5 shrink-0 text-slate-50" />
                  <span className="min-w-0">{feature}</span>
                </li>
              ))}
            </ul>
    
            {switchTo ? (
              <button
                type="button"
                disabled={option.value === switchTo.currentTerm || switchTo.pendingTerm !== null}
                onClick={() => switchTo.onSwitch(option.value)}
                className={`tap flex h-12 w-full items-center justify-center rounded-xl text-small font-semibold transition disabled:cursor-not-allowed ${
                  option.value === switchTo.currentTerm
                    ? "bg-neu-base text-slate-400 shadow-pressed-low"
                    : featured
                      ? "bg-amber-400 text-black shadow-raised-mid hover:brightness-110 active:shadow-pressed-low disabled:opacity-60"
                      : "bg-neu-base text-slate-100 shadow-raised-low hover:text-slate-50 active:shadow-pressed-low disabled:opacity-60"
                }`}
              >
                {switchTo.pendingTerm === option.value && <MorphingSquare size={14} className="mr-2 shrink-0" />}
                {option.value === switchTo.currentTerm ? "Your current plan" : `Switch to ${option.label}`}
              </button>
            ) : (
              <Link
                href={`/billing/plans?term=${option.value}&who=${isFamily ? "family" : "solo"}`}
                className={`flex h-12 items-center justify-center rounded-xl text-small font-semibold transition ${
                  featured
                    ? "bg-amber-400 text-black shadow-raised-mid hover:brightness-110 active:shadow-pressed-low"
                    : "bg-neu-base text-slate-100 shadow-raised-low active:shadow-pressed-low hover:text-slate-50"
                }`}
              >
                {isFamily ? "Bundle & save" : "Start plan"}
              </Link>
            )}
          </div>
          ),
    };
  }

  return (
    <div className={narrow ? "@container" : undefined}>
      <div className={`mx-auto mb-8 flex flex-col items-center gap-3 ${switchTo ? "hidden" : ""}`}>
        <Segmented
          label="Who is learning"
          value={audience}
          onChange={(v) => setAudience(v as Audience)}
          options={[
            { value: "solo", label: "Just me" },
            { value: "family", label: `Group (${MIN_FAMILY_BUNDLE_RECIPIENTS}+ students)` },
          ]}
        />
        {isFamily && (
          <p className="text-small text-slate-400">
            Extra {Math.round(pricing.familyDiscountRate * 100)}% off every plan below, per student.
          </p>
        )}
      </div>

      {/* Phones: one plan at a time, swipe left and right (the 6-month "best value" plan opens first). */}
      <div className={narrow ? "@xl:hidden" : "lg:hidden"}>
        <SnapCarousel label="Plans" peek={34} gap={12} defaultIndex={FEATURED_INDEX} viewportClassName="-my-6 py-8">
          {TERM_OPTIONS.map((option) => (
            <div key={option.value} className="relative flex h-full flex-col">
              {renderCard(option).node}
            </div>
          ))}
        </SnapCarousel>
      </div>

      <motion.div
        // No `key` on purpose: the cards stay mounted when you flip Solo/Family
        // or the weekly length, so only the numbers change (they count).
        variants={gridContainer}
        initial="hidden"
        animate="visible"
        className={narrow ? "hidden items-stretch gap-3 @xl:grid @xl:grid-cols-3" : "hidden items-stretch gap-5 lg:grid lg:grid-cols-3"}
      >
        {TERM_OPTIONS.map((option) => {
          const { featured, node } = renderCard(option);
          return (
            <motion.div key={option.value} variants={cardItem} className={`relative flex flex-col ${featured && !narrow ? "z-10 lg:-my-3 lg:scale-[1.05]" : ""}`}>
              {node}
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
              ? "bg-neu-base text-signal-fg shadow-raised-low"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
