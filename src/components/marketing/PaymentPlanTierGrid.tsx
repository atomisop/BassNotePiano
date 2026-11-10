"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
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
  discountPercentForTerm,
} from "@/lib/classCreditPricing";
import { CheckIcon } from "@/components/ui/icons";
import { NumberTicker } from "@/components/ui/number-ticker";
import { SnapCarousel } from "@/components/ui/SnapCarousel";

const TERM_OPTIONS: { value: PaymentPlanTerm; label: string }[] = [
  { value: "MONTHLY", label: "1 Month" },
  { value: "TERM_3", label: "3 Months" },
  { value: "TERM_6", label: "6 Months" },
];

/** The card that gets the purple glow and the rising stars (a marketing choice, not the lowest price). */
const FEATURED_TERM: PaymentPlanTerm = "TERM_6";

/**
 * One look per plan length, for Just me and for a group. Every value is a registered CSS colour (globals.css), so flipping between
 * the two glides from one colour to the other instead of switching.
 */
// The badge states the commitment, which is always true. It used to say "Most popular" and "Best value", claims nothing in our data
// backed (P1-PAY-01); the owner can set the discounts to anything, so a price claim could also go stale.
const TIER_LOOK: Record<"MONTHLY" | "TERM_3" | "TERM_6", { tag: string; solo: Look; family: Look }> = {
  MONTHLY: {
    tag: "No commitment",
    solo: { tint: "rgb(70 105 200)", accent: "rgb(165 195 255)", glow: "rgb(120 160 255)" },
    family: { tint: "rgb(214 150 70)", accent: "rgb(255 205 150)", glow: "rgb(255 170 90)" },
  },
  TERM_3: {
    tag: "3 payments",
    solo: { tint: "rgb(140 140 40)", accent: "rgb(225 232 120)", glow: "rgb(200 210 80)" },
    family: { tint: "rgb(225 170 40)", accent: "rgb(255 224 120)", glow: "rgb(255 205 70)" },
  },
  TERM_6: {
    tag: "6 payments",
    solo: { tint: "rgb(120 80 210)", accent: "rgb(200 175 255)", glow: "rgb(170 130 255)" },
    family: { tint: "rgb(226 78 42)", accent: "rgb(255 150 105)", glow: "rgb(255 105 55)" },
  },
};
type Look = { tint: string; accent: string; glow: string };

const STARS = [
  { l: 8, s: 13, d: 3.6, y: 0 }, { l: 22, s: 16, d: 4.8, y: 1.4 }, { l: 36, s: 12, d: 3.9, y: 0.6 },
  { l: 49, s: 15, d: 5.2, y: 2.2 }, { l: 61, s: 13, d: 4.1, y: 0.9 }, { l: 74, s: 17, d: 5, y: 1.8 },
  { l: 86, s: 12, d: 3.7, y: 0.3 }, { l: 15, s: 14, d: 4.5, y: 2.9 }, { l: 68, s: 12, d: 4.3, y: 3.4 }, { l: 42, s: 14, d: 4.9, y: 3.8 },
];

const FEATURED_INDEX = Math.max(0, TERM_OPTIONS.findIndex((o) => o.value === FEATURED_TERM));

type Audience = "solo" | "family";

/** The retired yearly length has no card of its own; it borrows the six month look. */
export function tierLook(term: PaymentPlanTerm) {
  return TIER_LOOK[term === "MONTHLY" || term === "TERM_3" ? term : "TERM_6"];
}

export function tierVars(look: Look): CSSProperties {
  return { "--tier-tint": look.tint, "--tier-accent": look.accent, "--tier-glow": look.glow } as CSSProperties;
}

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
  scholarshipPercent = 0,
  switchTo,
  narrow = false,
  select,
}: {
  pricing?: PricingConfig;
  personalDiscountPercent?: number;
  /** Percent off from a claimed scholarship; it prices the 6 Month plan only. */
  scholarshipPercent?: number;
  switchTo?: TierGridSwitch;
  /** For a column that is not the full page (Settings): dense cards, all three side by side whenever the column is wide enough, the swipe carousel only when it is not. */
  narrow?: boolean;
  /** Pick mode (the plan form): the buttons choose a length instead of linking away, and the audience comes from the form. */
  select?: { term: PaymentPlanTerm; onSelect: (term: PaymentPlanTerm) => void; audience: Audience };
}) {
  // One plan on offer: a 45-minute class a week.
  const cadence: PaymentPlanCadence = OFFERED_PLAN_CADENCE;
  const [pickedAudience, setAudience] = useState<Audience>("solo");
  const audience = select ? select.audience : pickedAudience;
  const solo = (cents: number, term: PaymentPlanTerm) => {
    const percent = discountPercentForTerm({ percent: personalDiscountPercent, scholarshipPercent }, term);
    return percent > 0 ? discountedPlanPriceCents(cents, percent) : cents;
  };
  const monthlyBaseline = solo(calculatePaymentPlanRate(cadence, "MONTHLY", pricing).installmentAmountCents, "MONTHLY");
  const isFamily = audience === "family" && !switchTo;
  const look = (term: PaymentPlanTerm) => (isFamily ? tierLook(term).family : tierLook(term).solo);

  // One plan card. It is built once for the swipe carousel (phones) and once for the side-by-side grid (lg and up), never one
  // element placed in two spots, so each place gets its own copy.
  function renderCard(option: (typeof TERM_OPTIONS)[number]): { featured: boolean; node: ReactNode } {
    const rate = calculatePaymentPlanRate(cadence, option.value, pricing);
    const family = calculateFamilyBundleTotal(cadence, option.value, MIN_FAMILY_BUNDLE_RECIPIENTS, pricing);
    const isMonthly = option.value === "MONTHLY";
    const featured = option.value === FEATURED_TERM;

    const perStudentCents = isFamily ? family.perStudentMonthlyCents : solo(rate.installmentAmountCents, option.value);
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

    // Von Restorff: only the featured plan is lit (its colour, glow and stars) and only its button is solid. The other two are
    // plain cards with a quiet button, so the eye lands on one plan and then compares prices.
    const primaryCta = "tier-accent-bg text-black hover:brightness-110";
    const quietCta = "bg-slate-50/8 text-slate-50 hover:bg-slate-50/12";
    const ctaBase = "tap flex h-12 w-full items-center justify-center rounded-full text-small font-semibold transition disabled:cursor-not-allowed active:scale-[0.99]";

    return {
      featured,
      node: (
          <div
            style={tierVars(look(option.value))}
            className={`relative isolate flex flex-1 flex-col rounded-2xl border border-ink/10 bg-neu-base ${narrow ? "gap-4 p-4" : "gap-6 p-7 sm:p-8"} ${
              featured ? "" : "transition hover:shadow-raised-high"
            }`}
          >
            {/* Both colour sets are painted once and the flip fades between them (opacity only), so nothing repaints while it glides. */}
            {featured &&
              (["solo", "family"] as const).map((who) => (
                <div
                  key={who}
                  aria-hidden
                  style={tierVars(tierLook(option.value)[who])}
                  className={`tier-layer tier-card tier-glow pointer-events-none absolute inset-0 -z-10 rounded-2xl ${(who === "family") === isFamily ? "opacity-100" : "opacity-0"}`}
                />
              ))}
            {featured && (
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                {STARS.map((star, i) => (
                  <span
                    key={i}
                    className="tier-star"
                    style={{ left: `${star.l}%`, width: star.s, height: star.s, "--star-d": `${star.d}s`, "--star-delay": `${star.y}s` } as CSSProperties}
                  />
                ))}
              </div>
            )}
            {/* Which plan, quietly: the price below is the one loud thing on the card. */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-body font-semibold text-slate-50">{option.label}</p>
              <span className={featured ? "tier-accent-bg rounded-full px-2.5 py-0.5 text-small font-semibold text-black" : "text-small text-slate-400"}>
                {tierLook(option.value).tag}
              </span>
            </div>

            <div>
              <p className={`text-small tabular-nums text-slate-500 ${narrow ? "min-h-5" : "h-5"}`}>
                {percentOff > 0 && (
                  <span className="line-through">
                    <NumberTicker value={monthlyBaseline} format={formatUsd} />
                  </span>
                )}
                {percentOff > 0 && (
                  <span className="ml-2 font-semibold text-slate-300">
                    −<NumberTicker value={percentOff} />%
                  </span>
                )}
              </p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                <span className={`font-serif tabular-nums ${narrow ? "text-headline leading-none" : "text-hero"} tier-price`}>
                  <NumberTicker value={perStudentCents} format={formatUsd} />
                </span>
                <span className="text-small text-slate-400">{isFamily ? "per student, every 28 days" : "every 28 days"}</span>
              </p>
            </div>

            <div className="h-px w-full bg-ink/10" />

            <ul className="flex flex-1 flex-col gap-3">
              {features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2.5 text-small text-slate-400">
                  <CheckIcon size={16} className="mt-0.5 shrink-0 text-slate-500" />
                  <span className="min-w-0">{feature}</span>
                </li>
              ))}
            </ul>

            {(() => {
              if (switchTo) {
                const current = option.value === switchTo.currentTerm;
                return (
                  <button
                    type="button"
                    disabled={current || switchTo.pendingTerm !== null}
                    onClick={() => switchTo.onSwitch(option.value)}
                    className={
                      current
                        ? "tap flex h-12 w-full items-center justify-center rounded-full bg-neu-base text-small font-semibold text-slate-400 shadow-pressed-low"
                        : `${ctaBase} ${featured ? primaryCta : quietCta} disabled:opacity-60`
                    }
                  >
                    {switchTo.pendingTerm === option.value && <MorphingSquare size={14} className="mr-2 shrink-0" />}
                    {current ? "Your current plan" : `Switch to ${option.label}`}
                  </button>
                );
              }
              if (select) {
                const chosen = select.term === option.value;
                return (
                  <button type="button" aria-pressed={chosen} onClick={() => select.onSelect(option.value)} className={`${ctaBase} ${chosen ? primaryCta : quietCta}`}>
                    {chosen ? "Selected" : "Choose this plan"}
                  </button>
                );
              }
              return (
                <Link href={`/billing/plans?term=${option.value}&who=${isFamily ? "family" : "solo"}`} className={`${ctaBase} ${featured ? primaryCta : quietCta}`}>
                  {isFamily ? "Bundle & save" : "Start plan"}
                </Link>
              );
            })()}
          </div>
          ),
    };
  }

  return (
    <div className={narrow ? "@container" : undefined}>
      {/* The warm wash a group plan puts behind the page: it fills in from the bottom of the screen. */}
      <div aria-hidden className="tier-wash" style={{ opacity: isFamily ? 1 : 0 }} />
      <div className={`mx-auto mb-8 flex flex-col items-center gap-3 ${switchTo || select ? "hidden" : ""}`}>
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
        <SnapCarousel label="Plans" peek={34} gap={12} defaultIndex={FEATURED_INDEX} viewportClassName="-my-12 py-14">
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
