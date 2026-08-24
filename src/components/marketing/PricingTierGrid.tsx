"use client";

import Link from "next/link";
import NumberFlow from "@number-flow/react";
import { motion } from "framer-motion";
import {
  PRESET_BUNDLES,
  MIN_CUSTOM_QUANTITY,
  CREDIT_ORIGINAL_PRICE_CENTS,
  CREDIT_DISCOUNT_PERCENT,
  LIMITED_TIME_BUNDLE_DISCOUNT_RATE,
  calculateClassCreditTotal,
} from "@/lib/classCreditPricing";

/**
 * Four real bundle sizes, laid out as plain, equal-weight cards. This used
 * to be adapted from a 21st.dev SaaS pricing block: a "Most popular" badge,
 * one card inverted to a light "premium" treatment, and a checkmark-bulleted
 * feature list under each price. None of that fit what's actually being
 * sold here — one product (a 30-minute class credit) at four quantities,
 * with a bigger discount the more you buy. There's no plan to steer anyone
 * toward, so nothing is flagged as featured; the real numbers (price,
 * per-credit rate, discount) do the work a "Most popular" ribbon would
 * otherwise be standing in for.
 */

interface TierDef {
  id: string;
  label: string;
  quantity: number;
}

const TIER_DEFS: TierDef[] = [
  { id: "single", label: "Single credit", quantity: MIN_CUSTOM_QUANTITY },
  { id: PRESET_BUNDLES[0].id, label: PRESET_BUNDLES[0].label, quantity: PRESET_BUNDLES[0].quantity },
  { id: PRESET_BUNDLES[1].id, label: PRESET_BUNDLES[1].label, quantity: PRESET_BUNDLES[1].quantity },
  { id: PRESET_BUNDLES[2].id, label: PRESET_BUNDLES[2].label, quantity: PRESET_BUNDLES[2].quantity },
];

const TIERS = TIER_DEFS.map((t) => ({ ...t, total: calculateClassCreditTotal(t.quantity) }));

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const gridContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const cardItem = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

export function PricingTierGrid() {
  return (
    <motion.div
      variants={gridContainer}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
    >
      {TIERS.map((tier) => {
        // Single-credit shows its own permanent "was $50, now $34.99"
        // badge (a real markdown off the original price). The three
        // bundle tiers get a separate, newer badge: a limited-time markdown
        // off the price the tier already showed, not stacked visibly on
        // top of the bundle-size discount. Customers see one "was $X, now
        // $Y" pair and one badge, not two percentages to reconcile.
        const isSingleCredit = tier.quantity === MIN_CUSTOM_QUANTITY;
        const showLimitedTime = tier.total.hasLimitedTimeDiscount;
        return (
          <motion.div
            key={tier.id}
            variants={cardItem}
            className="glass-surface relative flex flex-col gap-4 rounded-2xl border border-transparent p-5 transition hover:border-[rgb(var(--c-a-400)/0.3)] sm:p-6"
          >
            {isSingleCredit && (
              <span className="absolute right-3 top-3 rounded-full bg-[rgb(var(--c-a-400))] px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-950">
                -{CREDIT_DISCOUNT_PERCENT}%
              </span>
            )}
            {showLimitedTime && (
              <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-[rgb(var(--c-a-400))] px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-950">
                Limited time · -{Math.round(LIMITED_TIME_BUNDLE_DISCOUNT_RATE * 100)}%
              </span>
            )}
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[rgb(var(--c-a-300))]">{tier.label}</p>

            <div>
              {showLimitedTime && (
                <p className="text-sm tabular-nums text-slate-500 line-through">
                  ${(tier.total.preLimitedTimeTotalCents / 100).toFixed(2)}
                </p>
              )}
              <p className="font-serif text-3xl tabular-nums text-slate-50 sm:text-4xl">
                <NumberFlow value={tier.total.totalCents / 100} format={{ style: "currency", currency: "USD", trailingZeroDisplay: "stripIfInteger" }} />
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {tier.quantity} credit{tier.quantity > 1 ? "s" : ""} ·{" "}
                {isSingleCredit && (
                  <span className="line-through">${(CREDIT_ORIGINAL_PRICE_CENTS / 100).toFixed(2)}</span>
                )}{" "}
                ${(tier.total.perCreditCents / 100).toFixed(2)}/ea
              </p>
            </div>

            <p className="flex-1 text-xs leading-relaxed text-slate-400">
              30-minute live classes on Zoom. Credits never expire, and unused ones roll over indefinitely.
            </p>

            <Link
              href={`/billing/lessons?quantity=${tier.quantity}`}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-ink/10 py-2.5 text-center text-sm font-semibold text-slate-100 transition hover:border-[rgb(var(--c-a-400)/0.4)] hover:text-[rgb(var(--c-a-300))]"
            >
              Buy credits
              <ArrowIcon />
            </Link>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
