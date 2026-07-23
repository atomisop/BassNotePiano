"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { SCALE_GROUPS, PRO_LIFETIME_PRICE_CENTS } from "@/lib/curriculum";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const heroContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const heroItem = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 26 } },
};

const gridContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const gridItem = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 240, damping: 24 } },
};

export default function LandingPage() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(ellipse_at_top,_rgba(217,180,88,0.14),_transparent_60%)]"
      />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-serif text-sm tracking-[0.2em] text-slate-200">
          BASS NOTE <span className="text-amber-400">PIANO</span>
        </span>
        <nav className="flex items-center gap-6 text-sm text-slate-400">
          <Link href="/pricing" className="transition hover:text-slate-100">
            Pricing
          </Link>
          <Link
            href={isLoggedIn ? "/dashboard" : "/login"}
            className="rounded-full border border-white/10 px-4 py-1.5 text-slate-200 transition hover:border-amber-400/50 hover:text-amber-300"
          >
            {isLoggedIn ? "Dashboard" : "Log in"}
          </Link>
        </nav>
      </header>

      <motion.section
        variants={heroContainer}
        initial="hidden"
        animate="visible"
        className="relative mx-auto max-w-3xl px-6 pb-20 pt-16 text-center sm:pt-24"
      >
        <motion.p
          variants={heroItem}
          className="mx-auto mb-5 w-fit rounded-full border border-amber-400/25 bg-amber-400/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-amber-300"
        >
          Six scale groups · All 12 keys
        </motion.p>
        <motion.h1 variants={heroItem} className="font-serif text-4xl leading-tight text-slate-50 sm:text-5xl">
          Ethiopian Scales, <span className="text-amber-300">Rhythm</span> &amp; Chords
        </motion.h1>
        <motion.p variants={heroItem} className="mx-auto mt-5 max-w-xl text-balance text-base text-slate-400 sm:text-lg">
          An interactive masterclass in the Ethiopian kiñit system — Tizita, Bati, Anchihoye, and Mixolydian
          pentatonics — spelled correctly in every key, with native chords mapped for each one.
        </motion.p>
        <motion.div variants={heroItem} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={isLoggedIn ? "/dashboard" : "/register"}
            className="rounded-xl bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
          >
            {isLoggedIn ? "Go to dashboard" : "Start learning"}
          </Link>
          <Link
            href="/pricing"
            className="rounded-xl border border-white/10 px-6 py-3 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/5"
          >
            See pricing
          </Link>
        </motion.div>
      </motion.section>

      <motion.section
        variants={gridContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        className="relative mx-auto max-w-6xl px-6 pb-24"
      >
        <h2 className="mb-8 text-center font-serif text-2xl text-slate-100">The curriculum</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SCALE_GROUPS.map((scale) => (
            <motion.article
              key={scale.slug}
              variants={gridItem}
              whileHover={{ y: -4 }}
              className="group glass-card p-5 transition hover:border-amber-400/30"
            >
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">{scale.code}</p>
              <h3 className="mt-2 font-serif text-lg text-slate-50">{scale.title}</h3>
              {scale.kinitName && <p className="mt-1 text-sm text-slate-500">{scale.kinitName}</p>}
              <p className="mt-4 font-mono text-xs text-slate-400">{scale.formula.split("-").join(" – ")}</p>
            </motion.article>
          ))}
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
        className="relative mx-auto max-w-4xl px-6 pb-28"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="glass-card p-6">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Pay-As-You-Go</p>
            <p className="mt-2 font-serif text-3xl text-slate-50">$25</p>
            <p className="mt-1 text-sm text-slate-500">per session, unlocked in order</p>
          </div>
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-6">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-300">Pro — Lifetime</p>
            <p className="mt-2 font-serif text-3xl text-slate-50">{formatUsd(PRO_LIFETIME_PRICE_CENTS)}</p>
            <p className="mt-1 text-sm text-amber-200/70">one-time · all six scale groups · saves $50</p>
          </div>
        </div>
      </motion.section>

      <footer className="relative border-t border-white/5 px-6 py-8 text-center text-xs text-slate-600">
        Bass Note Piano — a digital companion to the Ethiopian Scales, Rhythm &amp; Chords curriculum book.
      </footer>
    </div>
  );
}
