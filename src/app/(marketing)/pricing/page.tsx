"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { CREDIT_BASE_PRICE_CENTS, PRESET_BUNDLES, calculateClassCreditTotal } from "@/lib/classCreditPricing";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";
import { TiltGlow } from "@/components/ui/TiltGlow";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { SiteFooter } from "@/components/marketing/SiteFooter";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
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
  "Jump ahead to any scale — with a quick confirmation if you skip earlier ones",
  "One payment, lifetime access — no further Zelle transfers",
];

export default function PricingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="fixed inset-0 -z-10">
        <PhotoBackdrop src={BACKDROPS.pricing} scrim="standard" priority sizes="100vw" />
      </div>

      <MarketingNav />

      <motion.section
        variants={container}
        initial="hidden"
        animate="visible"
        className="relative mx-auto max-w-3xl px-6 pb-12 pt-24 text-center"
      >
        <motion.p
          variants={item}
          className="glass-pill mx-auto mb-4 w-fit px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-amber-300"
        >
          Pricing
        </motion.p>
        <motion.h1 variants={item} className="font-serif text-4xl text-slate-50">
          One price. Every scale. Forever.
        </motion.h1>
        <motion.p variants={item} className="mx-auto mt-4 max-w-lg text-base text-slate-200">
          Every scale and its native chords, spelled correctly in all 12 keys — a single {formatUsd(CURRICULUM_PRICE_CENTS)}{" "}
          payment unlocks the whole curriculum for good.
        </motion.p>
      </motion.section>

      <motion.section
        variants={container}
        initial="hidden"
        animate="visible"
        className="relative mx-auto max-w-lg px-6 pb-16"
      >
        <TiltGlow className="glass-surface-elevated p-8 text-center" maxTilt={4}>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-300">Curriculum — Lifetime</p>
          <p className="mt-3 font-serif text-5xl text-slate-50">{formatUsd(CURRICULUM_PRICE_CENTS)}</p>
          <p className="mt-1 text-sm text-amber-200/70">one-time payment · no subscriptions, ever</p>

          <ul className="mt-6 space-y-2.5 text-left text-sm text-slate-100">
            {CURRICULUM_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex gap-2.5">
                <span className="text-amber-400">→</span>
                {benefit}
              </li>
            ))}
          </ul>

          <Link
            href="/billing/curriculum"
            className="cta-sheen mt-7 block w-full rounded-xl bg-amber-400 py-2.5 text-center text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
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
        className="relative mx-auto max-w-2xl px-6 pb-28"
      >
        <div className="glass-surface p-7 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Weekly classes</p>
          <h2 className="mt-1.5 font-serif text-2xl text-slate-50">Live group coaching on Zoom</h2>
          <p className="mt-2 text-sm text-slate-300">
            Six recurring weekly classes, capped at 10 students each — on top of your self-paced curriculum. 1 credit
            = 30 minutes of class, and that conversion never changes no matter which bundle you buy.
          </p>

          <div className="mt-6 rounded-xl border border-ink/10 bg-surface p-5 text-center">
            <p className="font-serif text-3xl text-slate-50">
              {formatUsd(CREDIT_BASE_PRICE_CENTS)}
              <span className="text-base font-sans text-amber-200/70"> / credit</span>
            </p>
            <p className="mt-1 text-sm text-amber-200/70">Bundle up and save up to 30% per credit</p>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {PRESET_BUNDLES.map((bundle) => {
              const total = calculateClassCreditTotal(bundle.quantity);
              return (
                <div key={bundle.id} className="rounded-lg border border-ink/10 p-3 text-center">
                  <p className="text-xs font-medium text-slate-200">{bundle.label}</p>
                  <p className="mt-1 font-serif text-lg text-slate-50">{formatUsd(total.totalCents)}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {bundle.quantity} credits · {formatUsd(total.perCreditCents)}/ea
                  </p>
                </div>
              );
            })}
          </div>

          <Link
            href="/billing/lessons"
            className="mt-6 block w-full rounded-xl border border-ink/10 py-2.5 text-center text-sm font-semibold text-slate-100 transition hover:border-amber-400/40 hover:text-amber-300"
          >
            Buy class credits
          </Link>
        </div>
      </motion.section>

      <SiteFooter />
    </div>
  );
}
