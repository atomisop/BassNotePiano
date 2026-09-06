"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CURRICULUM_PRICE_CENTS, CURRICULUM_ORIGINAL_PRICE_CENTS, CURRICULUM_DISCOUNT_PERCENT } from "@/lib/curriculum";
import { CREDIT_BASE_PRICE_CENTS, CREDIT_ORIGINAL_PRICE_CENTS } from "@/lib/classCreditPricing";
import { TiltGlow } from "@/components/ui/TiltGlow";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { PricingTierGrid } from "@/components/marketing/PricingTierGrid";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

const CURRICULUM_BENEFITS = [
  "All six scale groups, unlocked immediately",
  "Jump ahead to any scale, with a quick confirmation if you skip earlier ones",
  "One payment, lifetime access: no further Zelle transfers",
];

export function PricingPageContent() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <MarketingNav />

      {/* id + tabIndex: the skip link in (marketing)/layout.tsx targets
          #main-content — see terms/page.tsx for why this moved onto a real
          <main> instead of an empty placeholder div. */}
      <main id="main-content" tabIndex={-1} className="outline-none">
      <motion.section
        variants={container}
        initial="hidden"
        animate="visible"
        className="relative mx-auto max-w-3xl px-6 pb-16 pt-28 text-center"
      >
        <motion.h1
          variants={item}
          className="text-balance font-serif text-5xl leading-[1.02] tracking-[-0.025em] text-slate-50 sm:text-6xl"
        >
          One price. Every scale. Forever.
        </motion.h1>
        {/* text-slate-50, not text-slate-200: -200 measured under 4.5:1 at
            the worst point behind it even with the "dense" scrim above —
            same issue as the homepage curriculum section, see that comment
            for the full measurement. -50 matches the H1 and actually clears
            it. */}
        <motion.p variants={item} className="mx-auto mt-5 max-w-lg text-base text-slate-50 sm:text-lg">
          Every scale and its native chords, spelled correctly in all 12 keys. A single {formatUsd(CURRICULUM_PRICE_CENTS)}{" "}
          payment (down from {formatUsd(CURRICULUM_ORIGINAL_PRICE_CENTS)}) unlocks the whole curriculum for good.
        </motion.p>
      </motion.section>

      <motion.section
        variants={container}
        initial="hidden"
        animate="visible"
        className="relative mx-auto max-w-lg px-6 pb-20"
      >
        <TiltGlow className="glass-surface-elevated relative p-9 text-center sm:p-11" maxTilt={4}>
          {/* A ribbon poking over the card's own top edge, not a line
              inside it — sitting it in the flow right above "Curriculum ·
              Lifetime" (as an earlier version did) read as one continuous
              phrase ("limited time offer curriculum lifetime...") that
              could be misread as the lifetime access itself being time-
              limited, which it isn't. The card border between them now
              makes it unambiguous that this is a separate promo tag. */}
          <div className="absolute -top-3.5 right-6 flex items-center gap-1.5 sm:-top-4 sm:right-8">
            <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400 ring-1 ring-inset ring-amber-400/40">
              Limited time offer
            </span>
            <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold tabular-nums text-slate-950">
              -{CURRICULUM_DISCOUNT_PERCENT}%
            </span>
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50))]">Curriculum · Lifetime</p>
          <div className="mt-4 flex flex-col items-center gap-1">
            <span className="text-xl tabular-nums text-slate-500 line-through sm:text-2xl">
              {formatUsd(CURRICULUM_ORIGINAL_PRICE_CENTS)}
            </span>
            <span className="font-serif text-7xl tabular-nums text-slate-50">{formatUsd(CURRICULUM_PRICE_CENTS)}</span>
          </div>
          <p className="mt-2 text-sm text-[rgb(var(--c-s-50)/0.7)]">one-time payment · no subscriptions, ever</p>

          <ul className="mt-7 space-y-2.5 text-left text-sm text-slate-100">
            {CURRICULUM_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex gap-2.5">
                <span className="text-[rgb(var(--c-s-50))]">→</span>
                {benefit}
              </li>
            ))}
          </ul>

          <Link
            href="/billing/curriculum"
            className="cta-sheen cta-fill mt-8 block w-full rounded-xl py-3 text-center text-sm font-semibold"
          >
            Unlock the curriculum
          </Link>
        </TiltGlow>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className="relative mx-auto max-w-5xl px-6 pb-32"
      >
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Weekly classes</p>
          <h2 className="mt-1.5 font-serif text-3xl text-slate-50">Live one-on-one coaching on Discord</h2>
          <p className="mx-auto mt-2.5 max-w-md text-sm text-slate-300">
            Book your own time with the teacher — or a family session if siblings are learning together — on top of
            your self-paced curriculum. 1 credit ={" "}
            <span className="text-slate-500 line-through">{formatUsd(CREDIT_ORIGINAL_PRICE_CENTS)}</span>{" "}
            {formatUsd(CREDIT_BASE_PRICE_CENTS)}, and that never changes no matter which bundle you buy. Bigger
            bundles just knock the per-credit rate down.
          </p>
        </div>

        <div className="mt-10">
          <PricingTierGrid />
        </div>

        {/* Sits under the four fixed-price tiers, not as a fifth tile in
            that grid: its price depends on how many recipients you add, so
            it can't show a single number the way the other four cards do. */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="glass-surface mt-6 flex flex-col items-start gap-4 rounded-2xl border border-[rgb(var(--c-s-50)/0.2)] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7"
        >
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[rgb(var(--c-s-50))]">Family bundle</p>
            <p className="mt-1.5 text-sm text-slate-300">
              Buying for 2 or more kids? Bundle the same tier across their accounts and get an{" "}
              <span className="text-slate-100">extra 25% off</span> the combined total, for a limited time. Each
              recipient just needs their own account already.
            </p>
          </div>
          <Link
            href="/billing/lessons?mode=family"
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-ink/10 px-5 py-2.5 text-center text-sm font-semibold text-slate-100 transition hover:border-[rgb(var(--c-s-50)/0.4)] hover:text-[rgb(var(--c-s-50))]"
          >
            Bundle &amp; save
          </Link>
        </motion.div>
      </motion.section>
      </main>

      <SiteFooter />
    </div>
  );
}
