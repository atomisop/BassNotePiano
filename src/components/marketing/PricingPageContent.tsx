"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FAMILY_BUNDLE_DISCOUNT_RATE } from "@/lib/classCreditPricing";
import { TiltGlow } from "@/components/ui/TiltGlow";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { PaymentPlanTierGrid } from "@/components/marketing/PaymentPlanTierGrid";

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

const CLASS_BENEFITS = [
  "Live one-on-one classes with your teacher every week",
  "The full curriculum, opened one scale at a time as you and your teacher move through it",
  "Your teacher tracks your progress and decides when you're ready for the next scale",
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
          Learn live. The curriculum comes with it.
        </motion.h1>
        <motion.p variants={item} className="mx-auto mt-5 max-w-lg text-base text-slate-50 sm:text-lg">
          Every scale and its native chords, spelled correctly in all 12 keys, taught by your teacher in live classes
          and opened as you progress.
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
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50))]">Included with every class plan</p>
          <ul className="mt-6 space-y-2.5 text-left text-sm text-slate-100">
            {CLASS_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex gap-2.5">
                <span className="text-[rgb(var(--c-s-50))]">→</span>
                {benefit}
              </li>
            ))}
          </ul>

          <Link
            href="#plans"
            className="cta-sheen cta-fill mt-8 block w-full rounded-xl py-3 text-center text-sm font-semibold"
          >
            See class plans
          </Link>
        </TiltGlow>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        id="plans"
        className="relative mx-auto max-w-5xl px-6 pb-32"
      >
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Weekly classes</p>
          <h2 className="mt-1.5 font-serif text-3xl text-slate-50">Live one-on-one coaching on Discord</h2>
          <p className="mx-auto mt-2.5 max-w-md text-sm text-slate-300">
            Every plan includes the curriculum. Pick a weekly cadence and pay month to month, or lock in a lower rate
            with a longer term — paid one Zelle installment at a time, never
            all at once.
          </p>
        </div>

        <div className="mt-10">
          <PaymentPlanTierGrid />
        </div>

        {/* Sits under the four term cards, not as a fifth tile in that grid:
            its price depends on how many recipients you add, so it can't
            show a single number the way the other four cards do. Family
            bundle purchasing is its own, separate flow from Payment Plans,
            picking the same cadence/term as those four cards, just paid
            once upfront for the whole term instead of monthly. */}
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
              Buying for 2 or more kids? Bundle the same cadence and term across their accounts and get an{" "}
              <span className="text-slate-100">extra {FAMILY_BUNDLE_DISCOUNT_RATE * 100}% off</span> the combined total, for a limited time. Each
              recipient just needs their own account already.
            </p>
          </div>
          <Link
            href="/billing/lessons"
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
