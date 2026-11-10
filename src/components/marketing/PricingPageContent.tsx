"use client";

import { motion } from "framer-motion";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { PricingBento } from "@/components/stageshow/scenes/PricingBento";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { PaymentPlanTierGrid } from "@/components/marketing/PaymentPlanTierGrid";
import { SPRING } from "@/lib/motionTokens";
import type { PricingConfig } from "@/lib/classCreditPricing";

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: SPRING.smooth },
};

export function PricingPageContent({ pricing }: { pricing?: PricingConfig }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <MarketingNav />

      {/* id + tabIndex: the skip link in (marketing)/layout.tsx targets
          #main-content, see terms/page.tsx for why this moved onto a real
          <main> instead of an empty placeholder div. */}
      <main id="main-content" tabIndex={-1} className="outline-none">
      <motion.section
        variants={container}
        initial="hidden"
        animate="visible"
        className="relative mx-auto max-w-3xl px-6 pb-4 pt-28 text-center"
      >
        <motion.h1
          variants={item}
          className="text-balance font-serif text-hero leading-[1.02] tracking-tight text-slate-50 sm:text-hero"
        >
          Learn live with us on Discord.
        </motion.h1>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px 0px 20% 0px" }}
        transition={SPRING.smooth}
        id="plans"
        className="relative mx-auto max-w-5xl px-6 pb-32"
      >
        {/* The page title above is the one headline; this is its quiet subtitle, so the prices in the cards are the next
            thing the eye lands on. */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-caption font-medium uppercase tracking-caps text-slate-500">Weekly classes</p>
          <h2 className="mt-1 text-body text-slate-400">Live one-on-one coaching on Discord</h2>
        </div>

        <div className="mt-10">
          <PaymentPlanTierGrid pricing={pricing} />
        </div>

        <div className="mx-auto mt-16 max-w-3xl">
          <PricingBento pricing={pricing} />
        </div>
      </motion.section>
      </main>

      <SiteFooter />
    </div>
  );
}
