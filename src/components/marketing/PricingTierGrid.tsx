"use client";

import Link from "next/link";
import NumberFlow from "@number-flow/react";
import { motion } from "framer-motion";
import {
  PRESET_BUNDLES,
  MIN_CUSTOM_QUANTITY,
  calculateClassCreditTotal,
} from "@/lib/classCreditPricing";

/**
 * Adapted from a 21st.dev pricing-block pattern (tab-switcher + animated
 * tier cards) — not a literal port. That component's shape assumed a SaaS
 * with named plans and a monthly/yearly toggle; this app sells one thing
 * two ways (a $99 curriculum, and class credits with a quantity-based
 * bundle discount), so there's no second axis for a toggle to switch. What
 * carried over is the part that's genuinely reusable here: four tiers laid
 * out as cards, the cheapest a plain entry point, the middle one flagged
 * "Most popular", the largest given the premium/inverted treatment, and the
 * price itself animating in rather than just appearing — all real numbers
 * computed from calculateClassCreditTotal, the same function the actual
 * purchase flow uses, so this can never drift out of sync with it.
 */

type Featured = "popular" | "premium" | null;

interface TierDef {
  id: string;
  label: string;
  quantity: number;
  featured: Featured;
}

const TIER_DEFS: TierDef[] = [
  { id: "single", label: "Single credit", quantity: MIN_CUSTOM_QUANTITY, featured: null },
  { id: PRESET_BUNDLES[0].id, label: PRESET_BUNDLES[0].label, quantity: PRESET_BUNDLES[0].quantity, featured: null },
  { id: PRESET_BUNDLES[1].id, label: PRESET_BUNDLES[1].label, quantity: PRESET_BUNDLES[1].quantity, featured: "popular" },
  { id: PRESET_BUNDLES[2].id, label: PRESET_BUNDLES[2].label, quantity: PRESET_BUNDLES[2].quantity, featured: "premium" },
];

const TIERS = TIER_DEFS.map((t) => ({ ...t, total: calculateClassCreditTotal(t.quantity) }));

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden className="shrink-0">
      <path d="M5 12l5 5L19 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
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
        const isPremium = tier.featured === "premium";
        const isPopular = tier.featured === "popular";
        return (
          <motion.div
            key={tier.id}
            variants={cardItem}
            whileHover={{ y: -3 }}
            className={`relative flex flex-col gap-5 rounded-2xl p-5 transition sm:p-6 ${
              isPremium
                ? "bg-slate-50 text-slate-950"
                : isPopular
                  ? "glass-surface-elevated border-[rgb(var(--c-a-400)/0.5)]"
                  : "glass-surface"
            }`}
          >
            {isPopular && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[rgb(var(--c-a-400))] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-950">
                Most popular
              </span>
            )}

            {/*
              isPremium intentionally inverts to a light card regardless of
              which theme is active (the "stand out from the page" premium
              treatment) — so its text can't use the slate-* ramp the way
              every other card here does. That ramp is calibrated against
              the current theme's own ground (dark, since these pages are
              locked to Paper); on this card's deliberately-inverted light
              background those same tones ran too light to read. neutral-*
              is Tailwind's untouched literal scale — not themed, not
              overridden in the `@theme` block in globals.css — so it stays
              correctly dark on this always-light card no matter what theme
              the rest of the page is in.
            */}
            <p
              className={`text-xs font-medium uppercase tracking-[0.14em] ${
                isPremium ? "text-neutral-600" : "text-[rgb(var(--c-a-300))]"
              }`}
            >
              {tier.label}
            </p>

            <div>
              <p className={`font-serif text-3xl tabular-nums sm:text-4xl ${isPremium ? "text-neutral-950" : "text-slate-50"}`}>
                <NumberFlow value={tier.total.totalCents / 100} format={{ style: "currency", currency: "USD", trailingZeroDisplay: "stripIfInteger" }} />
              </p>
              <p className={`mt-1 text-xs ${isPremium ? "text-neutral-500" : "text-slate-500"}`}>
                {tier.quantity} credit{tier.quantity > 1 ? "s" : ""} · ${(tier.total.perCreditCents / 100).toFixed(0)}/ea
              </p>
            </div>

            <ul className={`flex-1 space-y-2 text-xs ${isPremium ? "text-neutral-700" : "text-slate-300"}`}>
              <li className="flex items-center gap-2">
                <span className={isPremium ? "text-emerald-600" : "text-emerald-400"}>
                  <CheckIcon />
                </span>
                30-minute live classes on Zoom
              </li>
              {tier.total.discountRate > 0 ? (
                <li className="flex items-center gap-2">
                  <span className={isPremium ? "text-emerald-600" : "text-emerald-400"}>
                    <CheckIcon />
                  </span>
                  {Math.round(tier.total.discountRate * 100)}% off the per-credit rate
                </li>
              ) : (
                <li className="flex items-center gap-2">
                  <span className={isPremium ? "text-emerald-600" : "text-emerald-400"}>
                    <CheckIcon />
                  </span>
                  No commitment — buy one at a time
                </li>
              )}
              <li className="flex items-center gap-2">
                <span className={isPremium ? "text-emerald-600" : "text-emerald-400"}>
                  <CheckIcon />
                </span>
                Credits never expire
              </li>
            </ul>

            <Link
              href="/billing/lessons"
              className={`group flex items-center justify-center gap-2 rounded-xl py-2.5 text-center text-sm font-semibold transition ${
                isPremium
                  ? "bg-neutral-950 text-neutral-50 hover:bg-neutral-800"
                  : isPopular
                    ? "cta-sheen cta-fill"
                    : "border border-ink/10 text-slate-100 hover:border-[rgb(var(--c-a-400)/0.4)] hover:text-[rgb(var(--c-a-300))]"
              }`}
            >
              Buy credits
              <span className="transition-transform group-hover:translate-x-0.5">
                <ArrowIcon />
              </span>
            </Link>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
