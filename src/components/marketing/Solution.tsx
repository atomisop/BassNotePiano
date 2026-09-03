import { SOLO_MAX_CREDITS } from "@/lib/classSchedule";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { SolutionScreenshotTabs } from "@/components/marketing/SolutionScreenshotTabs";

/**
 * HOMEPAGE REDESIGN.
 *
 * No outer glass-surface card: marketing.css's own "STRUCTURE" comment
 * reserves a card for "the product reveal, where a bounded surface is
 * literally what is being shown": that's the screenshot panel specifically
 * (SolutionScreenshotTabs' own rounded border), not the whole section. The
 * text column sits directly on the page, laid out with editorial-grid.
 *
 * Content itself carries over from the earlier 21st.dev-inspired pass:
 * accordion-style features (the real one already in this repo,
 * src/components/ui/accordion.tsx, the same instance FAQ.tsx uses) instead
 * of a static list, and the two real screenshots switching via a floating
 * pill control. This is a plain server component, not "use client":
 * SOLO_MAX_CREDITS comes from @/lib/classSchedule, whose own chain
 * (notifications -> email -> resend) is server-only, Prisma-touching code;
 * the one genuinely interactive part (the screenshot switcher) is its own
 * small client component that takes plain string props instead.
 *
 * Every feature and both images are still exactly what they were before
 * this redesign: real, already-built app functionality and real
 * screenshots, not aspirational copy. See each one's own history in git
 * blame rather than repeating it here.
 */
const FEATURES = [
  {
    title: "Six scales, all twelve keys",
    body: "Tizita, Bati, Anchihoye, Mixolydian, and more, spelled correctly wherever a singer needs them, not just the easy keys.",
  },
  {
    title: "Chords built in, not bolted on",
    body: "Each scale's native chords come from its own five notes. There's no separate chord theory to memorize on top of the scale.",
  },
  {
    title: "Piano, guitar, and bass",
    body: "The same curriculum, correctly voiced for your instrument, switchable any time from inside a lesson.",
  },
  {
    title: "Quiz-gated progression",
    body: "Each scale unlocks the next only after you've actually practiced it and passed its quiz, not just clicked through.",
  },
  {
    // SOLO_MAX_CREDITS is in 30-minute units (see classSchedule.ts's own
    // CHUNK_MIN); computed rather than hardcoded so this can't drift from
    // the real booking cap, and phrased in minutes instead of assuming a
    // clean hour boundary in case that constant ever changes to something
    // that doesn't divide evenly into 60.
    title: (() => {
      const minutes = SOLO_MAX_CREDITS * 30;
      const durationLabel = minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minutes`;
      return `Live lessons, up to ${durationLabel} at a time`;
    })(),
    body: "One-on-one with your teacher, or a family session if siblings are learning together, booked on your own schedule over Discord.",
  },
  {
    title: "Credits that never expire",
    body: "Buy once, book whenever. Nothing is charged until the lesson actually happens.",
  },
];

// Only two, not three: /screenshots/lessons.png was a real capture but a
// stale one (predated this session's booking-model rebuild, still showed
// "up to 10 students per class"). Removed rather than shipped as a real
// screenshot of something no longer true. A fresh capture is real product
// work someone with a live session has to do, not something to fake.
const SCREENS = [
  { key: "dashboard", label: "Roadmap", src: "/screenshots/dashboard.png", alt: "Roadmap dashboard showing scale progress, badges, and practice streak" },
  { key: "profile", label: "Profile", src: "/screenshots/profile.png", alt: "Profile page showing streak history and earned badges" },
];

export function Solution() {
  return (
    <section id="curriculum" className="scroll-mt-24 py-[var(--space-5)] md:py-[var(--space-8)]">
      <ScrollReveal className="editorial-grid items-start">
        <div className="md:col-span-6">
          <p className="label label-muted">The fix</p>
          <h2 className="display-2 mt-4 max-w-[18ch] text-balance">A spelling engine for Ethiopian music.</h2>
          <p className="lead mt-5 max-w-[46ch]">
            This teaches the underlying grammar instead of one song at a time, so you can play
            anything in the tradition, in any key, correctly.
          </p>

          <Accordion type="single" collapsible className="mt-8" defaultValue="feature-0">
            {FEATURES.map((feature, i) => (
              <AccordionItem key={feature.title} value={`feature-${i}`} className="border-ink/10">
                <AccordionTrigger className="text-left font-serif text-base text-slate-50 no-underline hover:no-underline sm:text-lg">
                  {feature.title}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-slate-400">{feature.body}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* The one bounded surface in this section, by design: this is
            marketing.css's "product reveal" exception, not a leftover
            card habit. SolutionScreenshotTabs already carries its own
            rounded border for the image itself. */}
        <div className="md:col-span-6 md:col-start-7">
          <SolutionScreenshotTabs screens={SCREENS} defaultKey="dashboard" />
        </div>
      </ScrollReveal>
    </section>
  );
}
