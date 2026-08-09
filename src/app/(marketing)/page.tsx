"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { SCALE_GROUPS, CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { CREDIT_BASE_PRICE_CENTS } from "@/lib/classCreditPricing";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";
import { TiltGlow } from "@/components/ui/TiltGlow";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { ScrollToTopButton } from "@/components/marketing/ScrollToTopButton";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { PhoneCarousel, type PhoneScreenshot } from "@/components/marketing/PhoneCarousel";

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

// Real product visualization, not more mood photography — a static echo of
// the actual in-app roadmap (src/components/progression/ScaleRoadmap.tsx),
// same step-marker/checklist visual language, sample progress data local to
// this section only. Deliberately NOT the live interactive component: its
// cards navigate via next-auth session state, which would misbehave (dead
// clicks) on a logged-out marketing page.
const ROADMAP_PREVIEW = [
  { code: "S0", title: "Diatonic Scale, Chromatic Scale & the Seven Modes", status: "completed" as const },
  { code: "S1", title: "Major Pentatonic — Tizita Major", status: "in_progress" as const },
  { code: "S2", title: "Minor Pentatonic — Bati Minor", status: "locked" as const },
];

function RoadmapPreviewMarker({ status }: { status: "completed" | "in_progress" | "locked" }) {
  if (status === "completed") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-slate-950">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12l5 5L19 8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  if (status === "locked") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-ink/10 bg-slate-950 text-slate-600">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-400/10 text-xs font-semibold text-amber-300">
      2
    </div>
  );
}

const ROADMAP_STATUS_LABEL: Record<(typeof ROADMAP_PREVIEW)[number]["status"], string> = {
  completed: "Completed",
  in_progress: "In progress",
  locked: "Locked",
};

// Real in-app screens, not staged mockups — captured directly from a
// logged-in account (see public/screenshots/).
const APP_SCREENSHOTS: PhoneScreenshot[] = [
  { src: "/screenshots/dashboard.png", alt: "Roadmap dashboard showing scale progress, badges, and practice streak" },
  { src: "/screenshots/lessons.png", alt: "Weekly class booking screen with credit balance and upcoming classes" },
  { src: "/screenshots/profile.png", alt: "Profile page showing streak history and earned badges" },
];

const INSTRUMENT_SECTIONS = [
  {
    key: "guitar",
    src: BACKDROPS.guitar,
    label: "Guitar",
    copy: "The same Tizita and Bati pentatonics you learn at the keys map directly onto six strings.",
  },
];

export default function LandingPage() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <div className="relative overflow-hidden bg-slate-950">
      <MarketingNav />

      {/* ============ Hero — full-bleed piano backdrop, full viewport height ============ */}
      <section className="relative isolate flex min-h-screen flex-col overflow-hidden">
        <PhotoBackdrop src={BACKDROPS.marketingHero} scrim="light" parallax priority sizes="100vw" />

        <motion.div
          variants={heroContainer}
          initial="hidden"
          animate="visible"
          className="relative z-10 mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center px-6 pb-20 pt-20 text-center"
        >
          <motion.p
            variants={heroItem}
            className="glass-pill mx-auto mb-5 w-fit px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-amber-300"
          >
            Only {formatUsd(CURRICULUM_PRICE_CENTS)} · Lifetime access
          </motion.p>
          <motion.h1 variants={heroItem} className="font-serif text-4xl leading-tight text-slate-50 sm:text-5xl">
            Ethiopian Scales, <span className="text-amber-300">Rhythm</span> &amp; Chords
          </motion.h1>
          <motion.p variants={heroItem} className="mx-auto mt-5 max-w-xl text-balance text-base text-slate-200 sm:text-lg">
            An interactive masterclass in the Ethiopian kiñit system — Tizita, Bati, Anchihoye, and Mixolydian
            pentatonics — spelled correctly in every key, with native chords mapped for each one.
          </motion.p>
          <motion.div variants={heroItem} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={isLoggedIn ? "/dashboard" : "/register"}
              className="cta-sheen rounded-xl bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
            >
              {isLoggedIn ? "Go to dashboard" : `Start learning — ${formatUsd(CURRICULUM_PRICE_CENTS)}`}
            </Link>
            <Link
              href="/pricing"
              className="glass-pill px-6 py-3 text-sm font-medium text-slate-100 transition hover:text-amber-300"
            >
              See pricing
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ============ Curriculum grid — its own backdrop, distinct from the hero, full viewport height ============ */}
      <motion.section
        variants={gridContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16"
      >
        <PhotoBackdrop src={BACKDROPS.curriculum} scrim="standard" sizes="100vw" />
        <div className="relative z-10 mx-auto w-full max-w-6xl">
          <h2 className="mb-3 text-center font-serif text-2xl text-slate-100">Six scales, one connected path</h2>
          <p className="mx-auto mb-8 max-w-md text-center text-sm text-slate-300">
            Work through six chapters in sequence. Read the module, complete the practice, and pass an 80% quiz to
            unlock the next stage — or unlock everything at once.
          </p>

          <div className="glass-surface-elevated mx-auto mb-10 max-w-lg p-6 sm:p-7">
            {ROADMAP_PREVIEW.map((scale, i) => (
              <div key={scale.code} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <RoadmapPreviewMarker status={scale.status} />
                  {i < ROADMAP_PREVIEW.length - 1 && (
                    <span className="w-px flex-1 border-l-2 border-dotted border-ink/10" />
                  )}
                </div>
                <div className={i < ROADMAP_PREVIEW.length - 1 ? "pb-5" : ""}>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">{scale.code}</p>
                  <p className="mt-1 text-sm text-slate-100">{scale.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{ROADMAP_STATUS_LABEL[scale.status]}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SCALE_GROUPS.map((scale) => (
              <motion.article
                key={scale.slug}
                variants={gridItem}
                whileHover={{ y: -4 }}
                className="glass-surface group p-5 transition hover:border-amber-400/30"
              >
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">{scale.code}</p>
                <h3 className="mt-2 font-serif text-lg text-slate-50">{scale.title}</h3>
                {scale.kinitName && <p className="mt-1 text-sm text-slate-500">{scale.kinitName}</p>}
                <p className="mt-4 font-mono text-xs text-slate-400">{scale.formula.split("-").join(" – ")}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ============ Every instrument — full-bleed sections ============ */}
      {INSTRUMENT_SECTIONS.map((section, i) => (
        <motion.section
          key={section.key}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ type: "spring", stiffness: 240, damping: 26 }}
          className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16"
        >
          <PhotoBackdrop src={section.src} scrim="light" parallax sizes="100vw" />
          {i === 0 && (
            <p className="relative z-10 mx-auto mb-8 w-fit rounded-full px-3 py-1 text-center text-xs font-medium uppercase tracking-[0.2em] text-amber-300">
              One theory, every instrument
            </p>
          )}
          <div className="glass-surface-elevated relative z-10 mx-auto max-w-md px-7 py-8 text-center sm:px-8">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-amber-300">{section.label}</span>
            {i === 0 && (
              <h2 className="mt-3 font-serif text-2xl text-slate-50 sm:text-3xl">
                Kiñit is a language, not a piano trick
              </h2>
            )}
            <p className="mt-3 text-sm text-slate-200 sm:text-base">{section.copy}</p>
          </div>
        </motion.section>
      ))}

      {/* ============ The app itself — real screens, phone-framed ============ */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
        className="relative mx-auto max-w-6xl px-6 py-20 text-center"
      >
        <p className="eyebrow mb-3">See it in action</p>
        <h2 className="mx-auto max-w-lg font-serif text-2xl text-slate-50 sm:text-3xl">
          Your roadmap, badges, and classes — all in your pocket
        </h2>
        <p className="mx-auto mb-12 mt-3 max-w-md text-sm text-slate-400">
          Real screens from inside Bass Note Piano — drag or tap to explore.
        </p>
        <PhoneCarousel images={APP_SCREENSHOTS} />
      </motion.section>

      {/* ============ Pricing callout ============ */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
        className="relative mx-auto max-w-2xl px-6 py-28 text-center"
      >
        {/* The whole card is the link, not just the price. A bare text node is
            a poor click target, and everything in here — the eyebrow, the
            number, the terms — is about the same one destination. */}
        <Link href="/pricing" className="group block" aria-label="See full pricing">
          <TiltGlow
            className="glass-surface-elevated p-8 transition-colors group-hover:border-amber-400/60 sm:p-10"
            maxTilt={4}
          >
            <p className="eyebrow">Everything, once</p>
            <p className="mt-3 font-serif text-5xl text-slate-50">{formatUsd(CURRICULUM_PRICE_CENTS)}</p>
            <p className="mt-2 text-sm text-amber-200/70">One-time payment · every scale, forever · no subscriptions</p>
            {/* Without this the card looks like a static stat — there was
                nothing at all signalling it could be clicked. */}
            <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-amber-300">
              See full pricing
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
                className="transition-transform group-hover:translate-x-1"
              >
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </TiltGlow>
        </Link>
        <p className="mt-6 text-sm text-slate-500">
          Want live coaching too? Join weekly group classes on Zoom — {formatUsd(CREDIT_BASE_PRICE_CENTS)} per
          30-minute credit, with bundle discounts up to 30% off.
        </p>
      </motion.section>

      <SiteFooter />

      <ScrollToTopButton />
    </div>
  );
}
