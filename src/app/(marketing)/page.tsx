"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import NumberFlow from "@number-flow/react";
import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { PRESET_BUNDLES, calculateClassCreditTotal } from "@/lib/classCreditPricing";
import { TiltGlow } from "@/components/ui/TiltGlow";
import { SiteNavbar } from "@/components/marketing/SiteNavbar";
import { ScrollToTopButton } from "@/components/marketing/ScrollToTopButton";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { PhoneCarousel, type PhoneScreenshot } from "@/components/marketing/PhoneCarousel";
import { BentoFeatures } from "@/components/marketing/BentoFeatures";
import { KinitCards } from "@/components/marketing/KinitCards";
import { ScrollVideoBackground } from "@/components/marketing/ScrollVideoBackground";
import { RevealFromSide } from "@/components/marketing/RevealFromSide";
import { TextShelf } from "@/components/marketing/TextShelf";
import { CARD_SURFACE } from "@/lib/surface";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

const heroContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

// Expo-out: most of the distance is covered early, so the element reads as
// settling into place rather than starting from rest.
const heroItem = {
  hidden: { opacity: 0, y: 22, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const },
  },
};

// Real in-app screens, not staged mockups — captured directly from a
// logged-in account (see public/screenshots/).
const APP_SCREENSHOTS: PhoneScreenshot[] = [
  {
    src: "/screenshots/dashboard.png",
    alt: "Roadmap dashboard showing scale progress, badges, and practice streak",
  },
  {
    src: "/screenshots/lessons.png",
    alt: "Weekly class booking screen with credit balance and upcoming classes",
  },
  { src: "/screenshots/profile.png", alt: "Profile page showing streak history and earned badges" },
];

export default function LandingPage() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    // No page ground of its own any more. The fixed video behind this is the
    // ground for the whole homepage, so every section below is transparent and
    // the only thing standing between the footage and the type is the scrim
    // that ships with <ScrollVideoBackground>.
    //
    // overflow-x-clip, not overflow-hidden: `hidden` turns this into a scroll
    // container and silently disables `position: sticky` on the pinned stage
    // further down.
    <div className="relative overflow-x-clip">
      <ScrollVideoBackground />

      {/* Everything above the footage. */}
      <div className="relative z-10">
        <SiteNavbar />

        {/* ============ Hero ============ */}
        <section className="relative flex min-h-screen flex-col">
          <motion.div
            variants={heroContainer}
            initial="hidden"
            animate="visible"
            className="relative mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center px-6 pb-20 pt-32 text-center"
          >
            {/* Local shade for the hero block. The base tint alone no longer
                guarantees contrast — that budget was moved here so the footage
                stays vivid everywhere it isn't carrying type. */}
            <TextShelf strength={0.68} />

            <motion.span
              variants={heroItem}
              className="font-mono text-[11px] uppercase tracking-[0.22em] text-amber-300"
            >
              Ethiopian kiñit · Piano &amp; guitar
            </motion.span>

            <motion.h1
              variants={heroItem}
              className="mt-6 text-balance font-serif text-6xl leading-[0.98] tracking-[-0.03em] text-slate-50 sm:text-7xl lg:text-8xl"
            >
              Ethiopian Scales, <span className="text-amber-300">Rhythm</span> &amp; Chords
            </motion.h1>

            <motion.p
              variants={heroItem}
              className="mx-auto mt-7 max-w-xl text-balance text-lg leading-relaxed text-slate-200 sm:text-xl"
            >
              An interactive masterclass in the Ethiopian kiñit system — Tizita, Bati, Anchihoye, and
              Mixolydian pentatonics — spelled correctly in every key, with native chords mapped for
              each one.
            </motion.p>

            <motion.div
              variants={heroItem}
              className="mt-10 flex flex-wrap items-center justify-center gap-3"
            >
              <Link
                href={isLoggedIn ? "/dashboard" : "/register"}
                className="cta-sheen group flex items-center gap-3 rounded-full bg-amber-400 py-2 pl-6 pr-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
              >
                {isLoggedIn
                  ? "Go to dashboard"
                  : `Start learning — ${formatUsd(CURRICULUM_PRICE_CENTS)}`}
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/10 transition-transform group-hover:translate-x-0.5">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    aria-hidden
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
              <Link
                href="/pricing"
                className="glass-pill px-6 py-3 text-sm font-medium text-slate-100 transition hover:text-amber-300"
              >
                See pricing
              </Link>
            </motion.div>
          </motion.div>

          {/* Scroll affordance — doubles as the instruction for the video:
              the footage only advances if you scroll. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.6 }}
            className="flex justify-center pb-10"
          >
            <motion.div
              animate={{ y: [0, 7, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="flex flex-col items-center gap-2.5"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-300">
                Scroll
              </span>
              <span className="h-9 w-px bg-gradient-to-b from-amber-400/70 to-transparent" />
            </motion.div>
          </motion.div>
        </section>

        {/* ============ The four kiñits, as cards arriving from the edges ============ */}
        <KinitCards />

        {/* ============ Bento system grid ============ */}
        <BentoFeatures />

        {/* ============ The app itself — real screens, phone-framed ============ */}
        <section className="relative mx-auto max-w-6xl px-6 py-24 text-center">
          <RevealFromSide from="left">
            <div className={`${CARD_SURFACE} mx-auto mb-14 max-w-xl px-8 py-7`}>
              <h2 className="text-balance font-serif text-3xl leading-tight tracking-[-0.02em] text-slate-50 sm:text-4xl">
                Your roadmap, badges, and classes — all in your pocket
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Real screens from inside Bass Note Piano — drag or tap to explore.
              </p>
            </div>
          </RevealFromSide>
          <RevealFromSide from="up" delay={0.16}>
            <PhoneCarousel images={APP_SCREENSHOTS} />
          </RevealFromSide>
        </section>

        {/* ============ Pricing callout ============ */}
        <section className="relative mx-auto max-w-4xl px-6 py-28 text-center">
          <TextShelf strength={0.66} />
          <RevealFromSide from="left">
            <Link href="/pricing" className="group block" aria-label="See full pricing">
              <TiltGlow
                className="glass-surface-elevated p-10 transition-colors group-hover:border-amber-400/60 sm:p-14"
                maxTilt={4}
              >
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-300">
                  Everything, once
                </p>
                <p className="mt-4 font-serif text-7xl tabular-nums text-slate-50 sm:text-8xl">
                  <NumberFlow
                    value={CURRICULUM_PRICE_CENTS / 100}
                    format={{
                      style: "currency",
                      currency: "USD",
                      trailingZeroDisplay: "stripIfInteger",
                    }}
                  />
                </p>
                <p className="mt-3 text-base text-amber-200/70">
                  One-time payment · every scale, forever · no subscriptions
                </p>
                <span className="mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-amber-300">
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
          </RevealFromSide>

          <div className="mx-auto mt-6 grid max-w-2xl grid-cols-3 gap-3">
            {PRESET_BUNDLES.map((bundle, i) => {
              const total = calculateClassCreditTotal(bundle.quantity);
              const isBest = bundle.id === "best-value";
              return (
                <RevealFromSide key={bundle.id} from="right" delay={0.06 * i}>
                  <Link
                    href="/pricing"
                    className={`group/chip block rounded-xl p-4 transition ${
                      isBest
                        ? "bg-slate-50 hover:brightness-95"
                        : "glass-surface hover:border-amber-400/40"
                    }`}
                  >
                    <p
                      className={`text-[11px] font-medium uppercase tracking-[0.1em] ${
                        isBest ? "text-neutral-600" : "text-slate-300"
                      }`}
                    >
                      {bundle.label}
                    </p>
                    <p
                      className={`mt-1 font-serif text-2xl tabular-nums ${
                        isBest ? "text-neutral-950" : "text-slate-50"
                      }`}
                    >
                      <NumberFlow
                        value={total.totalCents / 100}
                        format={{
                          style: "currency",
                          currency: "USD",
                          trailingZeroDisplay: "stripIfInteger",
                        }}
                      />
                    </p>
                    <p
                      className={`mt-0.5 text-[11px] ${
                        isBest ? "text-neutral-500" : "text-slate-300"
                      }`}
                    >
                      {Math.round(total.discountRate * 100)}% off · {bundle.quantity} credits
                    </p>
                  </Link>
                </RevealFromSide>
              );
            })}
          </div>
          <RevealFromSide from="right">
            <p className={`${CARD_SURFACE} mx-auto mt-6 max-w-md px-6 py-4 text-sm text-slate-300`}>
              Live group classes on Zoom — see the full breakdown on the pricing page.
            </p>
          </RevealFromSide>
        </section>

        <SiteFooter />

        <ScrollToTopButton />
      </div>
    </div>
  );
}
