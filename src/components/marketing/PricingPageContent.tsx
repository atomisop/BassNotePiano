"use client";

import { motion } from "framer-motion";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { PricingBento } from "@/components/stageshow/scenes/PricingBento";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { PaymentPlanTierGrid } from "@/components/marketing/PaymentPlanTierGrid";
import { SPRING } from "@/lib/motionTokens";
import { CLASS_MINUTES, type PricingConfig } from "@/lib/classCreditPricing";

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
        className="relative mx-auto max-w-3xl px-6 pb-8 pt-28 text-center"
      >
        <motion.h1
          variants={item}
          className="text-balance font-serif text-hero leading-[1.02] tracking-tight text-slate-50"
        >
          Learn live with us on Discord.
        </motion.h1>
        {/* One quiet line under the one headline, then straight to the plans: the cards are what this page is for. A second
            eyebrow and heading used to sit between them and said "live on Discord" again. */}
        <motion.p variants={item} className="mx-auto mt-3 max-w-xl text-pretty text-body text-slate-400">
          One-on-one with your teacher, {CLASS_MINUTES} minutes a week. Pick the plan that fits.
        </motion.p>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px 0px 20% 0px" }}
        transition={SPRING.smooth}
        id="plans"
        className="relative mx-auto max-w-5xl px-6 pb-32"
      >
        <h2 className="sr-only">Plans</h2>
        <PaymentPlanTierGrid pricing={pricing} />

        <div className="mx-auto mt-16 max-w-3xl">
          <PricingBento pricing={pricing} />
        </div>
      </motion.section>
      </main>

      <SiteFooter />
    </div>
  );
}
