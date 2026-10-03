"use client";

import { motion } from "framer-motion";
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
        className="relative mx-auto max-w-3xl px-6 pb-10 pt-28 text-center"
      >
        <motion.h1
          variants={item}
          className="text-balance font-serif text-hero leading-[1.02] tracking-[-0.025em] text-slate-50 sm:text-hero"
        >
          Learn Live with us on discord.
        </motion.h1>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px 0px 8% 0px" }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        id="plans"
        className="relative mx-auto max-w-5xl px-6 pb-32"
      >
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Weekly classes</p>
          <h2 className="mt-1.5 font-serif text-body text-slate-50">Live one-on-one coaching on Discord</h2>
        </div>

        <div className="mt-10">
          <PaymentPlanTierGrid />
        </div>
      </motion.section>
      </main>

      <SiteFooter />
    </div>
  );
}
