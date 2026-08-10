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
      {/* "dense" (flat, strongest wash), not "vignette": vignette darkens a
          radial core centred on the fixed backdrop's own box — the full
          viewport height, not this section — so its dark centre lands
          roughly mid-viewport, well below the H1 anchored near the top
          under the nav. The H1 was landing outside the protected zone,
          directly on whatever the photo happens to be there — measured
          pixel-for-pixel, this particular photo's warm-toned patch there
          still left individual letters under 4.5:1 even at "standard"
          strength. Everything after the H1+paragraph — the price card, the
          classes card — is its own opaque surface either way, so this
          doesn't change how they read. */}
      <div className="fixed inset-0 -z-10">
        <PhotoBackdrop src={BACKDROPS.pricing} scrim="dense" priority sizes="100vw" />
      </div>

      <MarketingNav />

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
          Every scale and its native chords, spelled correctly in all 12 keys — a single {formatUsd(CURRICULUM_PRICE_CENTS)}{" "}
          payment unlocks the whole curriculum for good.
        </motion.p>
      </motion.section>

      <motion.section
        variants={container}
        initial="hidden"
        animate="visible"
        className="relative mx-auto max-w-lg px-6 pb-20"
      >
        <TiltGlow className="glass-surface-elevated p-9 text-center sm:p-11" maxTilt={4}>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-300">Curriculum — Lifetime</p>
          <p className="mt-4 font-serif text-7xl tabular-nums text-slate-50">{formatUsd(CURRICULUM_PRICE_CENTS)}</p>
          <p className="mt-2 text-sm text-amber-200/70">one-time payment · no subscriptions, ever</p>

          <ul className="mt-7 space-y-2.5 text-left text-sm text-slate-100">
            {CURRICULUM_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex gap-2.5">
                <span className="text-amber-400">→</span>
                {benefit}
              </li>
            ))}
          </ul>

          <Link
            href="/billing/curriculum"
            className="cta-sheen mt-8 block w-full rounded-xl bg-amber-400 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
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
        className="relative mx-auto max-w-2xl px-6 pb-32"
      >
        <div className="glass-surface p-7 sm:p-9">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Weekly classes</p>
          <h2 className="mt-1.5 font-serif text-3xl text-slate-50">Live group coaching on Zoom</h2>
          <p className="mt-2.5 text-sm text-slate-300">
            Six recurring weekly classes, capped at 10 students each — on top of your self-paced curriculum. 1 credit
            = 30 minutes of class, and that conversion never changes no matter which bundle you buy.
          </p>

          <div className="mt-7 rounded-xl border border-ink/10 bg-surface p-6 text-center">
            <p className="font-serif text-4xl tabular-nums text-slate-50">
              {formatUsd(CREDIT_BASE_PRICE_CENTS)}
              <span className="text-base font-sans text-amber-200/70"> / credit</span>
            </p>
            <p className="mt-1.5 text-sm text-amber-200/70">Bundle up and save up to 30% per credit</p>
          </div>

          {/* Three equal boxes was the flattest reading of this data: the
              recommended bundle now carries its own accent border and a
              small flag, rather than being visually identical to the other
              two and only distinguishable by reading the numbers. */}
          <div className="mt-5 grid grid-cols-3 gap-2.5">
            {PRESET_BUNDLES.map((bundle) => {
              const total = calculateClassCreditTotal(bundle.quantity);
              const isBest = bundle.id === "best-value";
              return (
                <div
                  key={bundle.id}
                  className={`relative rounded-lg p-3.5 text-center ${
                    isBest ? "border-2 border-amber-400/70 bg-amber-400/[0.06]" : "border border-ink/10"
                  }`}
                >
                  {isBest && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-950">
                      Best value
                    </span>
                  )}
                  <p className="mt-1 text-xs font-medium text-slate-200">{bundle.label}</p>
                  <p className={`mt-1 font-serif tabular-nums text-slate-50 ${isBest ? "text-2xl" : "text-lg"}`}>
                    {formatUsd(total.totalCents)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {bundle.quantity} credits · {formatUsd(total.perCreditCents)}/ea
                  </p>
                </div>
              );
            })}
          </div>

          <Link
            href="/billing/lessons"
            className="mt-7 block w-full rounded-xl border border-ink/10 py-2.5 text-center text-sm font-semibold text-slate-100 transition hover:border-amber-400/40 hover:text-amber-300"
          >
            Buy class credits
          </Link>
        </div>
      </motion.section>

      <SiteFooter />
    </div>
  );
}
