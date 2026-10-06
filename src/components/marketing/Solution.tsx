import { CLASS_MINUTES } from "@/lib/classCreditPricing";
import { SOLO_MAX_CREDITS } from "@/lib/classSchedule";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { SolutionScreenshotTabs } from "@/components/marketing/SolutionScreenshotTabs";
import { FeatureLoops } from "@/components/marketing/loops";

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
 *
 * MOBILE FIX: see SocialProof.tsx's own comment for the full explanation.
 * Same bug: both columns here only had `md:col-span-*`, no base span, so
 * `.editorial-grid`'s fixed 12-column layout squeezed the text column and
 * the screenshot panel into one sliver-width column each below md instead
 * of stacking full-width, reported as "mobile is cooked".
 */

// Real captures from inside the app (the demo student "Alex"), retaken for the
// current look. Order tells the story: where you are, how you learn, the three
// virtual instruments and their tools, then classes, progress and settings.
const SCREENS = [
  { key: "roadmap", label: "Roadmap", src: "/screenshots/roadmap.webp", title: "Your roadmap", caption: "Your next step, streak and badges.", alt: "Roadmap showing the next step, a four day streak, progress and badges" },
  { key: "lesson", label: "Lessons", src: "/screenshots/lesson.webp", title: "Video lessons", caption: "Watch, then practice right below.", alt: "A video lesson with playback controls and a virtual piano underneath" },
  { key: "piano", label: "Piano", src: "/screenshots/piano.webp", title: "Virtual piano", caption: "Tap a key to hear it.", alt: "Virtual piano with the C major scale highlighted" },
  { key: "classes", label: "Classes", src: "/screenshots/classes.webp", title: "Live classes", caption: "Book time with your teacher.", alt: "Calendar of available live class times with Book buttons" },
  { key: "profile", label: "Profile", src: "/screenshots/profile.webp", title: "Streaks and badges", caption: "Practice daily, earn badges.", alt: "Profile page with the weekly streak and earned badges" },
];

export function Solution() {
  return (
    <section id="curriculum" className="scroll-mt-24 py-[var(--space-5)] md:py-[var(--space-8)]">
      <ScrollReveal className="editorial-grid items-start">
        <div className="col-span-12 md:col-span-6">
          <h2 className="display-2 max-w-[18ch] text-balance">Everything in one place.</h2>

          <div className="mt-8">
            <FeatureLoops />
          </div>
        </div>

        {/* The one bounded surface in this section, by design: this is
            marketing.css's "product reveal" exception, not a leftover
            card habit. SolutionScreenshotTabs already carries its own
            rounded border for the image itself. */}
        <div className="col-span-12 md:col-span-6 md:col-start-7">
          <SolutionScreenshotTabs screens={SCREENS} defaultKey="roadmap" />
        </div>
      </ScrollReveal>
    </section>
  );
}
