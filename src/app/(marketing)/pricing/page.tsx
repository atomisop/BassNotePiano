"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { LESSON_PRICE_CENTS, IN_PERSON_DISCOUNT_RATE, calculateLessonTotal } from "@/lib/lessonPricing";

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
  const examplePricing = calculateLessonTotal(2, "IN_PERSON");

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,_rgba(217,180,88,0.14),_transparent_60%)]"
      />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="font-serif text-sm tracking-[0.2em] text-slate-200">
          BASS NOTE <span className="text-amber-400">PIANO</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-slate-400">
          <Link href="/classes" className="transition hover:text-slate-100">
            Classes
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-white/10 px-4 py-1.5 text-slate-200 transition hover:border-amber-400/50 hover:text-amber-300"
          >
            Log in
          </Link>
        </nav>
      </header>

      <motion.section
        variants={container}
        initial="hidden"
        animate="visible"
        className="relative mx-auto max-w-3xl px-6 pb-12 pt-10 text-center"
      >
        <motion.p
          variants={item}
          className="mx-auto mb-4 w-fit rounded-full border border-amber-400/25 bg-amber-400/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-amber-300"
        >
          Pricing
        </motion.p>
        <motion.h1 variants={item} className="font-serif text-4xl text-slate-50">
          One price. Every scale. Forever.
        </motion.h1>
        <motion.p variants={item} className="mx-auto mt-4 max-w-lg text-base text-slate-400">
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
        <motion.div variants={item} className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-8 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-300">Curriculum — Lifetime</p>
          <p className="mt-3 font-serif text-5xl text-slate-50">{formatUsd(CURRICULUM_PRICE_CENTS)}</p>
          <p className="mt-1 text-sm text-amber-200/70">one-time payment · no subscriptions, ever</p>

          <ul className="mt-6 space-y-2.5 text-left text-sm text-slate-200">
            {CURRICULUM_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex gap-2.5">
                <span className="text-amber-400">→</span>
                {benefit}
              </li>
            ))}
          </ul>

          <Link
            href="/billing/curriculum"
            className="mt-7 block w-full rounded-xl bg-amber-400 py-2.5 text-center text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
          >
            Unlock the curriculum
          </Link>
        </motion.div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
        className="relative mx-auto max-w-2xl px-6 pb-28"
      >
        <div className="glass-card p-7 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Live lessons</p>
          <h2 className="mt-1.5 font-serif text-2xl text-slate-50">Add real-time coaching, anytime</h2>
          <p className="mt-2 text-sm text-slate-400">
            Once you've got the curriculum, book 30-minute live lessons — Online or In-Person — in any quantity, on
            top of your self-paced learning.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 p-5">
              <p className="text-xs uppercase tracking-wide text-slate-500">Online</p>
              <p className="mt-2 font-serif text-3xl text-slate-50">
                {formatUsd(LESSON_PRICE_CENTS)}
                <span className="text-base font-sans text-slate-500"> / 30 min</span>
              </p>
              <p className="mt-1 text-sm text-slate-500">Full price, any quantity</p>
            </div>
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5">
              <p className="text-xs uppercase tracking-wide text-amber-300">In-Person</p>
              <p className="mt-2 font-serif text-3xl text-slate-50">
                {formatUsd(LESSON_PRICE_CENTS)}
                <span className="text-base font-sans text-amber-200/70"> / 30 min</span>
              </p>
              <p className="mt-1 text-sm text-amber-200/70">{Math.round(IN_PERSON_DISCOUNT_RATE * 100)}% off the total, any quantity</p>
            </div>
          </div>

          <p className="mt-5 text-sm text-slate-500">
            Example: 2 In-Person lessons = {formatUsd(examplePricing.subtotalCents)} − {Math.round(IN_PERSON_DISCOUNT_RATE * 100)}%
            ({formatUsd(examplePricing.discountCents)}) = <span className="text-slate-200">{formatUsd(examplePricing.totalCents)} total</span>.
          </p>

          <Link
            href="/billing/lessons"
            className="mt-6 block w-full rounded-xl border border-white/15 py-2.5 text-center text-sm font-semibold text-slate-100 transition hover:border-amber-400/40 hover:text-amber-300"
          >
            Buy lesson credits
          </Link>
        </div>
      </motion.section>

      <footer className="relative border-t border-white/5 px-6 py-8 text-center text-xs text-slate-600">
        Bass Note Piano — a digital companion to the Ethiopian Scales, Rhythm &amp; Chords curriculum book.
      </footer>
    </div>
  );
}
