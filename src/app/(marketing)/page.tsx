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
  visible: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

const gridContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const gridItem = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

// Real in-app screens, not staged mockups — captured directly from a
// logged-in account (see public/screenshots/).
const APP_SCREENSHOTS: PhoneScreenshot[] = [
  { src: "/screenshots/dashboard.png", alt: "Roadmap dashboard showing scale progress, badges, and practice streak" },
  { src: "/screenshots/lessons.png", alt: "Weekly class booking screen with credit balance and upcoming classes" },
  { src: "/screenshots/profile.png", alt: "Profile page showing streak history and earned badges" },
];

const STATUS_DOT: Record<"completed" | "current" | "upcoming", string> = {
  completed: "bg-emerald-400",
  current: "bg-amber-400",
  upcoming: "bg-ink/15",
};

// Position within the six-scale sequence, for the featured-card treatment
// below — every visitor is "at" scale 1 (the first one is a free preview of
// the system, the second is the natural next step to sell).
const FEATURED_INDEX = 1;

export default function LandingPage() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <div className="relative overflow-hidden bg-slate-950">
      <MarketingNav />

      {/* ============ Hero — full-bleed piano backdrop, full viewport height ============ */}
      <section className="relative isolate flex min-h-screen flex-col overflow-hidden">
        {/* Vignette, not a flat wash: the only thing floating unprotected on
            this photo is the text block below, roughly centred. Everywhere
            else — the piano's edges, the window light at the top, the floor
            at the bottom — reads as an actual photograph again instead of a
            pale suggestion of one. */}
        <PhotoBackdrop src={BACKDROPS.marketingHero} scrim="vignette" parallax priority sizes="100vw" />

        <motion.div
          variants={heroContainer}
          initial="hidden"
          animate="visible"
          className="relative z-10 mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center px-6 pb-20 pt-20 text-center"
        >
          <motion.h1
            variants={heroItem}
            className="text-balance font-serif text-6xl leading-[0.98] tracking-[-0.03em] text-slate-50 sm:text-7xl lg:text-8xl"
          >
            Ethiopian Scales, <span className="text-amber-300">Rhythm</span> &amp; Chords
          </motion.h1>
          <motion.p
            variants={heroItem}
            className="mx-auto mt-7 max-w-xl text-balance text-lg text-slate-200 sm:text-xl"
          >
            An interactive masterclass in the Ethiopian kiñit system — Tizita, Bati, Anchihoye, and Mixolydian
            pentatonics — spelled correctly in every key, with native chords mapped for each one.
          </motion.p>
          <motion.div variants={heroItem} className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {/* Button-in-button: the arrow gets its own nested circle instead
                of floating loose next to the label, so the primary action
                reads as one machined object rather than text-plus-glyph. */}
            <Link
              href={isLoggedIn ? "/dashboard" : "/register"}
              className="cta-sheen group flex items-center gap-3 rounded-full bg-amber-400 py-2 pl-6 pr-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
            >
              {isLoggedIn ? "Go to dashboard" : `Start learning — ${formatUsd(CURRICULUM_PRICE_CENTS)}`}
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/10 transition-transform group-hover:translate-x-0.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </Link>
            <Link href="/pricing" className="glass-pill px-6 py-3 text-sm font-medium text-slate-100 transition hover:text-amber-300">
              See pricing
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ============ Curriculum — its own backdrop, distinct from the hero ============ */}
      <motion.section
        variants={gridContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        className="relative isolate overflow-hidden px-6 py-32 sm:py-40"
      >
        {/* "dense" (flat, full-bleed, strongest wash), not "vignette": vignette
            darkens a radial core at the section's vertical *centre*, which is
            fine when text is centred in the section — it isn't here. This
            section's card grid pushes its real height well past the
            heading/paragraph up top, so the vignette's dark core landed below
            the text, leaving it to sit directly on whatever the photo happens
            to be at that spot. Measured it: this particular photo has a
            50/50 mix of dark shadow and near-white window light right where
            the text sits (luminance swinging from 0 to 0.92 within the same
            few square inches), so even "standard" strength still left
            individual letters unreadable wherever they crossed a bright
            patch. "dense" is what actually holds up regardless of which part
            of the photo ends up behind the text. */}
        <PhotoBackdrop src={BACKDROPS.curriculum} scrim="dense" sizes="100vw" />
        <div className="relative z-10 mx-auto w-full max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance font-serif text-4xl leading-[1.05] tracking-[-0.02em] text-slate-50 sm:text-5xl">
              Six scales, one connected path
            </h2>
            {/* text-slate-50, not the text-slate-300 every other subhead on
                this page uses: -300 is a deliberately muted tone, sized for
                sitting on a solid card. Measured pixel-for-pixel against this
                photo's brightest patch, "dense" scrim + -300 only reached
                3.5:1 — below the 4.5:1 floor. -100 got closer but still fell
                short of it at the single worst pixel (4.08:1); -50 is what
                actually clears 4.5:1 even there. */}
            <p className="mx-auto mt-4 max-w-md text-base text-slate-50">
              Work through six chapters in sequence. Read the module, complete the practice, and pass an 80% quiz to
              unlock the next stage — or unlock everything at once.
            </p>
          </div>

          {/* Asymmetric, not six equal boxes: the scale a new visitor would
              actually start on gets a full-width banner treatment with its
              formula spelled out as its own row of tokens — real data given
              room to be a visual, not smaller text stretched into a taller
              box. The other five sit below in an even, quieter grid. The
              banner carries the "you are here" status the separate preview
              widget used to duplicate, so that widget is gone. */}
          <div className="mt-14 space-y-4">
            {(() => {
              const featured = SCALE_GROUPS[FEATURED_INDEX];
              const rest = SCALE_GROUPS.filter((_, i) => i !== FEATURED_INDEX);
              return (
                <>
                  <motion.article
                    variants={gridItem}
                    whileHover={{ y: -3 }}
                    className="glass-surface-elevated group flex flex-col gap-6 p-7 transition sm:flex-row sm:items-center sm:justify-between sm:p-9"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-amber-300">
                          {featured.code} · Up next
                        </span>
                      </div>
                      <h3 className="mt-2.5 font-serif text-2xl leading-tight text-slate-50 sm:text-3xl">
                        {featured.title}
                      </h3>
                      {featured.kinitName && <p className="mt-1 text-sm text-slate-500">{featured.kinitName}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 sm:max-w-xs sm:justify-end">
                      {featured.formula.split("-").map((degree, di) => (
                        <span
                          key={di}
                          className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-1.5 font-mono text-sm text-amber-200"
                        >
                          {degree}
                        </span>
                      ))}
                    </div>
                  </motion.article>

                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                    {rest.map((scale) => {
                      const status = scale.order < featured.order ? "completed" : "upcoming";
                      return (
                        <motion.article
                          key={scale.slug}
                          variants={gridItem}
                          whileHover={{ y: -3 }}
                          className="glass-surface group flex flex-col justify-between p-5 transition hover:border-amber-400/30"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
                              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">
                                {scale.code}
                              </span>
                            </div>
                            <h3 className="mt-2.5 font-serif text-lg text-slate-50">{scale.title}</h3>
                            {scale.kinitName && <p className="mt-1 text-xs text-slate-500">{scale.kinitName}</p>}
                          </div>
                          <p className="mt-4 font-mono text-xs text-slate-400">{scale.formula.split("-").join(" – ")}</p>
                        </motion.article>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </motion.section>

      {/* ============ Every instrument ============ */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className="relative isolate overflow-hidden px-6 py-28 sm:py-36"
      >
        {/* Minimal, not a wash: the copy below lives entirely inside its own
            opaque card, so nothing here floats unprotected on the photo —
            the only job left for the backdrop is dissolving into the
            sections above and below it. The guitar gets to actually be a
            guitar. */}
        <PhotoBackdrop src={BACKDROPS.guitar} scrim="minimal" parallax sizes="100vw" />
        {/* Offset left rather than dead-centre — an asymmetric placement
            against a wide-open photo reads as composed, not as a box
            floating lost in empty space. */}
        <div className="glass-surface-elevated relative z-10 mx-auto max-w-md px-8 py-9 sm:mx-0 sm:ml-[8%]">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-amber-300">Guitar</span>
          <h2 className="mt-3 text-balance font-serif text-3xl leading-tight text-slate-50 sm:text-4xl">
            Kiñit is a language, not a piano trick
          </h2>
          <p className="mt-4 text-base text-slate-200">
            The same Tizita and Bati pentatonics you learn at the keys map directly onto six strings.
          </p>
        </div>
      </motion.section>

      {/* ============ The app itself — real screens, phone-framed ============ */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className="relative mx-auto max-w-6xl px-6 py-24 text-center"
      >
        <h2 className="mx-auto max-w-lg text-balance font-serif text-4xl leading-tight tracking-[-0.02em] text-slate-50 sm:text-5xl">
          Your roadmap, badges, and classes — all in your pocket
        </h2>
        <p className="mx-auto mb-14 mt-4 max-w-md text-base text-slate-400">
          Real screens from inside Bass Note Piano — drag or tap to explore.
        </p>
        <PhoneCarousel images={APP_SCREENSHOTS} />
      </motion.section>

      {/* ============ Pricing callout ============ */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className="relative mx-auto max-w-2xl px-6 py-28 text-center"
      >
        {/* The whole card is the link, not just the price. A bare text node
            is a poor click target, and everything in here — the number, the
            terms — is about the same one destination. */}
        <Link href="/pricing" className="group block" aria-label="See full pricing">
          <TiltGlow
            className="glass-surface-elevated p-10 transition-colors group-hover:border-amber-400/60 sm:p-14"
            maxTilt={4}
          >
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-300">Everything, once</p>
            <p className="mt-4 font-serif text-7xl tabular-nums text-slate-50 sm:text-8xl">
              {formatUsd(CURRICULUM_PRICE_CENTS)}
            </p>
            <p className="mt-3 text-base text-amber-200/70">One-time payment · every scale, forever · no subscriptions</p>
            {/* Without this the card looks like a static stat — there was
                nothing at all signalling it could be clicked. */}
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
