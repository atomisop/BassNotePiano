"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { SCALE_GROUPS, PRO_LIFETIME_PRICE_CENTS, TOTAL_PAY_AS_YOU_GO_CENTS } from "@/lib/curriculum";

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

export default function PricingPage() {
  const savings = TOTAL_PAY_AS_YOU_GO_CENTS - PRO_LIFETIME_PRICE_CENTS;

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
        <Link
          href="/login"
          className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-slate-200 transition hover:border-amber-400/50 hover:text-amber-300"
        >
          Log in
        </Link>
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
          Learn at your pace, or unlock everything at once
        </motion.h1>
        <motion.p variants={item} className="mx-auto mt-4 max-w-lg text-base text-slate-400">
          Every scale and its native chords, spelled correctly in all 12 keys — pay as you go, or unlock the whole
          curriculum for good.
        </motion.p>
      </motion.section>

      <motion.section
        variants={container}
        initial="hidden"
        animate="visible"
        className="relative mx-auto grid max-w-4xl grid-cols-1 gap-5 px-6 pb-16 sm:grid-cols-2"
      >
        <motion.div variants={item} className="glass-card p-7">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Pay-As-You-Go</p>
          <p className="mt-3 font-serif text-4xl text-slate-50">
            $25<span className="text-lg font-sans text-slate-500"> / session</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">{formatUsd(TOTAL_PAY_AS_YOU_GO_CENTS)} total across all 6 scale groups</p>

          <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
            <li className="flex gap-2.5">
              <span className="text-slate-600">→</span>
              Unlock scales one at a time, strictly in order
            </li>
            <li className="flex gap-2.5">
              <span className="text-slate-600">→</span>
              Pay via Zelle as you go — no upfront commitment
            </li>
            <li className="flex gap-2.5">
              <span className="text-slate-600">→</span>
              Multi-variant chapters (Bati, Anchihoye, Mixolydian) cost one session per variant
            </li>
          </ul>

          <Link
            href="/register"
            className="mt-7 block w-full rounded-xl border border-white/15 py-2.5 text-center text-sm font-semibold text-slate-100 transition hover:border-amber-400/40 hover:text-amber-300"
          >
            Start learning
          </Link>
        </motion.div>

        <motion.div variants={item} className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-7">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-300">Pro — Lifetime</p>
          <p className="mt-3 font-serif text-4xl text-slate-50">{formatUsd(PRO_LIFETIME_PRICE_CENTS)}</p>
          <p className="mt-1 text-sm text-amber-200/70">one-time payment · saves {formatUsd(savings)}</p>

          <ul className="mt-6 space-y-2.5 text-sm text-slate-200">
            <li className="flex gap-2.5">
              <span className="text-amber-400">→</span>
              All six scale groups, unlocked immediately
            </li>
            <li className="flex gap-2.5">
              <span className="text-amber-400">→</span>
              Jump ahead to any scale — with a quick confirmation if you skip earlier ones
            </li>
            <li className="flex gap-2.5">
              <span className="text-amber-400">→</span>
              One payment, lifetime access — no further Zelle transfers
            </li>
          </ul>

          <Link
            href="/billing/pro"
            className="mt-7 block w-full rounded-xl bg-amber-400 py-2.5 text-center text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
          >
            Get lifetime access
          </Link>
        </motion.div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
        className="relative mx-auto max-w-4xl px-6 pb-24"
      >
        <h2 className="mb-1 font-serif text-2xl text-slate-100">The full matrix</h2>
        <p className="mb-6 text-sm text-slate-500">
          Each chapter is priced by how many named variants it bundles — a $25 session per variant.
        </p>

        <div className="overflow-x-auto glass-card">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-6 py-3 font-medium">Scale</th>
                <th className="px-6 py-3 font-medium">Sessions</th>
                <th className="px-6 py-3 font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {SCALE_GROUPS.map((scale) => (
                <tr key={scale.slug} className="border-b border-white/5 last:border-0">
                  <td className="px-6 py-3">
                    <p className="text-xs uppercase tracking-wide text-amber-400/80">{scale.code}</p>
                    <p className="text-slate-200">{scale.title}</p>
                  </td>
                  <td className="px-6 py-3 text-slate-400">
                    {scale.sessionCount} session{scale.sessionCount === 1 ? "" : "s"}
                  </td>
                  <td className="px-6 py-3 font-medium text-slate-100">{formatUsd(scale.priceCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10">
                <td className="px-6 py-3 text-sm font-medium text-slate-300" colSpan={2}>
                  Pay-As-You-Go total
                </td>
                <td className="px-6 py-3 font-serif text-base text-slate-50">
                  {formatUsd(TOTAL_PAY_AS_YOU_GO_CENTS)}
                </td>
              </tr>
              <tr>
                <td className="px-6 py-3 text-sm font-medium text-amber-300" colSpan={2}>
                  Pro — lifetime
                </td>
                <td className="px-6 py-3 font-serif text-base text-amber-300">
                  {formatUsd(PRO_LIFETIME_PRICE_CENTS)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </motion.section>

      <footer className="relative border-t border-white/5 px-6 py-8 text-center text-xs text-slate-600">
        Bass Note Piano — a digital companion to the Ethiopian Scales, Rhythm &amp; Chords curriculum book.
      </footer>
    </div>
  );
}
