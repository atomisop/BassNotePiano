import { SOLO_MAX_CREDITS } from "@/lib/classSchedule";
import { ScrollGlassCard } from "@/components/marketing/ScrollGlassCard";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { SolutionScreenshotTabs } from "@/components/marketing/SolutionScreenshotTabs";

/**
 * HOMEPAGE REDESIGN: 21st.dev's "Feature Showcase" pattern
 * (@ruixen.ui/feature-showcase, id 9309), adapted, not lifted. What
 * survived the adaptation: the two-column shape (narrative + accordion on
 * the left, a real full-bleed media panel with a floating tab switcher on
 * the right) and the idea of accordion-style, one-open-at-a-time features
 * instead of a static grid. Everything else was rebuilt against this app's
 * own system rather than shadcn's generic theme:
 *   - Its Badge/Button/Tabs components are gone. This app already has its
 *     own eyebrow convention (.label), its own buttons (.btn), and only
 *     two real images to switch between, not enough to justify installing
 *     @radix-ui/react-tabs for a third UI-primitive file; a plain useState
 *     toggle does the same job with zero new dependencies.
 *   - Its own Accordion is gone in favor of the real one already in this
 *     repo (src/components/ui/accordion.tsx), the same instance FAQ.tsx
 *     uses, so there's one accordion implementation in the app, not two.
 *   - Generic bg-background/text-muted-foreground/bg-primary tokens are
 *     gone, replaced with this app's real c-a and c-s CSS custom properties.
 *
 * This is a plain server component, not "use client": SOLO_MAX_CREDITS
 * comes from @/lib/classSchedule, whose own chain (notifications -> email
 * -> resend) is server-only, Prisma-touching code. An earlier version of
 * this file was itself "use client" (for the screenshot tab state) and
 * imported that constant directly, which shipped that entire server chain
 * into the browser bundle and broke the build (webpack tried to statically
 * resolve resend's optional @react-email/render peer dependency inside a
 * CLIENT bundle, where the next.config.mjs serverComponentsExternalPackages
 * fix for that same package doesn't apply). The only genuinely interactive
 * part, the screenshot switcher, is now its own small client component
 * (SolutionScreenshotTabs) that takes plain string props instead of
 * importing anything server-side.
 *
 * Every feature and both images are still exactly what they were before
 * this redesign: real, already-built app functionality and real
 * screenshots, not aspirational copy. See each one's own history in git
 * blame rather than repeating it here.
 */
const FEATURES = [
  {
    title: "Six kiñit scales, all twelve keys",
    body: "Tizita, Bati, Anchihoye, Mixolydian, and more, spelled correctly wherever a singer needs them, not just the easy keys.",
  },
  {
    title: "Chords built in, not bolted on",
    body: "Each kiñit's native chords come from its own five notes. There's no separate chord theory to memorize on top of the scale.",
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
    <section id="curriculum" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-12 md:py-28">
      <ScrollGlassCard className="p-6 md:p-12" direction="right">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="label label-muted">The fix</p>
            <h2 className="display-2 mt-4 max-w-[18ch] text-balance">A spelling engine for Ethiopian music.</h2>
            <p className="lead mt-5 max-w-[46ch] text-slate-300">
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

          <SolutionScreenshotTabs screens={SCREENS} defaultKey="dashboard" />
        </div>
      </ScrollGlassCard>
    </section>
  );
}
