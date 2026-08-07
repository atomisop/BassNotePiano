"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { LESSON_PRICE_CENTS, LESSON_DISCOUNT_RATE, calculateLessonTotal } from "@/lib/lessonPricing";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";
import { TiltGlow } from "@/components/ui/TiltGlow";
import { MarketingNav } from "@/components/marketing/MarketingNav";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 26 } },
};

const CURRICULUM_BENEFITS = [
  "All six scale groups, unlocked immediately",
  "Jump ahead to any scale — with a quick confirmation if you skip earlier ones",
  "One payment, lifetime access — no further Zelle transfers",
];

export default function PricingPage() {
  const examplePricing = calculateLessonTotal(2);

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
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
        className="relative mx-auto max-w-2xl px-6 pb-28"
      >
        <div className="glass-surface p-7 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Live lessons</p>
          <h2 className="mt-1.5 font-serif text-2xl text-slate-50">Add real-time coaching, anytime</h2>
          <p className="mt-2 text-sm text-slate-300">
            Once you've got the curriculum, book 30-minute live lessons — Online or In-Person, same price either
            way — on top of your self-paced learning.
          </p>

          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-center">
            <p className="font-serif text-3xl text-slate-50">
              {formatUsd(LESSON_PRICE_CENTS)}
              <span className="text-base font-sans text-amber-200/70"> / 30 min</span>
            </p>
            <p className="mt-1 text-sm text-amber-200/70">
              Book 2 or more and save {Math.round(LESSON_DISCOUNT_RATE * 100)}% on the whole order — Online or In-Person
            </p>
          </div>

          <p className="mt-5 text-sm text-slate-400">
            Example: 2 lessons = {formatUsd(examplePricing.subtotalCents)} − {Math.round(LESSON_DISCOUNT_RATE * 100)}%
            ({formatUsd(examplePricing.discountCents)}) = <span className="text-slate-100">{formatUsd(examplePricing.totalCents)} total</span>. A
            single session stays {formatUsd(LESSON_PRICE_CENTS)}.
          </p>

          <Link
            href="/billing/lessons"
            className="mt-6 block w-full rounded-xl border border-white/15 py-2.5 text-center text-sm font-semibold text-slate-100 transition hover:border-amber-400/40 hover:text-amber-300"
          >
            Buy lesson credits
          </Link>
        </div>
      </motion.section>

      <footer className="relative border-t border-white/10 px-6 py-8 text-center text-xs text-slate-400">
        Bass Note Piano — a digital companion to the Ethiopian Scales, Rhythm &amp; Chords curriculum book.
      </footer>
    </div>
  );
}
