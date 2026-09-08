"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { PaymentPlanCadence, PaymentPlanTerm } from "@prisma/client";
import { calculatePaymentPlanRate } from "@/lib/classCreditPricing";

const CADENCE_OPTIONS: { value: PaymentPlanCadence; label: string }[] = [
  { value: "MIN_30_WEEKLY", label: "30 min/week" },
  { value: "MIN_60_WEEKLY", label: "60 min/week" },
];

const TERM_OPTIONS: { value: PaymentPlanTerm; label: string }[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "TERM_3", label: "3-Month" },
  { value: "TERM_6", label: "6-Month" },
  { value: "TERM_12", label: "Yearly" },
];

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const gridContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const cardItem = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

/**
 * Replaces the old quantity-tier PricingTierGrid (Single/Starter/Standard/
 * Best Value) now that individual credit purchasing only happens through
 * Payment Plans. Same card-grid visual language as that grid, describing
 * the term ladder that superseded it: a weekly-cadence toggle above four
 * term cards (Monthly/3/6/12-month). Every number comes from
 * calculatePaymentPlanRate — the same function /billing/plans itself
 * computes off of — so this can't quietly drift from the real price.
 */
export function PaymentPlanTierGrid() {
  const [cadence, setCadence] = useState<PaymentPlanCadence>("MIN_30_WEEKLY");
  const monthlyBaseline = calculatePaymentPlanRate(cadence, "MONTHLY").installmentAmountCents;

  return (
    <div>
      <div className="mx-auto mb-6 flex w-fit gap-1.5 rounded-full border border-ink/10 p-1">
        {CADENCE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setCadence(option.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              cadence === option.value
                ? "bg-[rgb(var(--c-s-50)/0.15)] text-[rgb(var(--c-s-50))]"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <motion.div
        variants={gridContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      >
        {TERM_OPTIONS.map((option) => {
          const rate = calculatePaymentPlanRate(cadence, option.value);
          const isMonthly = option.value === "MONTHLY";
          return (
            <motion.div
              key={option.value}
              variants={cardItem}
              className="glass-surface relative flex flex-col gap-4 rounded-2xl border border-transparent p-5 transition hover:border-[rgb(var(--c-s-50)/0.3)] sm:p-6"
            >
              <span
                className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                  isMonthly ? "bg-slate-800 text-slate-400" : "bg-amber-400 text-slate-950"
                }`}
              >
                {isMonthly ? "No commitment" : `−${Math.round(rate.discountRate * 100)}%`}
              </span>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[rgb(var(--c-s-50))]">{option.label}</p>

              <div>
                {!isMonthly && (
                  <p className="text-sm tabular-nums text-slate-500 line-through">{formatUsd(monthlyBaseline)}/mo</p>
                )}
                <p className="font-serif text-3xl tabular-nums text-slate-50 sm:text-4xl">
                  {formatUsd(rate.installmentAmountCents)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  per month · {rate.creditsPerInstallment} credits{isMonthly ? "" : ` · ${rate.termMonths} months`}
                </p>
              </div>

              <p className="flex-1 text-xs leading-relaxed text-slate-400">
                Paid one Zelle installment at a time, never all at once. Reserves your weekly time with the
                teacher for as long as you&apos;re enrolled.
              </p>

              <Link
                href={`/billing/plans?cadence=${cadence}&term=${option.value}`}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-ink/10 py-2.5 text-center text-sm font-semibold text-slate-100 transition hover:border-[rgb(var(--c-s-50)/0.4)] hover:text-[rgb(var(--c-s-50))]"
              >
                Start plan
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
