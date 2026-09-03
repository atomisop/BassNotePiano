import { PageBackground } from "@/components/marketing/PageBackground";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Hero } from "@/components/marketing/Hero";
import { PianoReveal } from "@/components/marketing/PianoReveal";
import { SocialProof } from "@/components/marketing/SocialProof";
import { ProblemStatement } from "@/components/marketing/ProblemStatement";
import { Solution } from "@/components/marketing/Solution";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { FAQ } from "@/components/marketing/FAQ";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { ScrollToTopButton } from "@/components/marketing/ScrollToTopButton";

/**
 * HOMEPAGE REBUILD: structural rework, per explicit direction. Hero,
 * social proof, problem statement, solution, how it works, FAQ, final CTA,
 * footer: the standard high-converting landing page structure, applied to
 * this app's own real content rather than a generic template.
 *
 * Retired in this pass, their real content absorbed elsewhere rather than
 * discarded (each new section's own comment says exactly where its facts
 * came from): `WhatBassNoteIs` and `ProductShowcase` → `Solution.tsx`;
 * `CurriculumOverview` → `HowItWorks.tsx` (reframed as the usage journey,
 * not curriculum contents, to avoid repeating Solution's feature list);
 * `ClassesOverview`'s booking facts → `Solution.tsx` and `FAQ.tsx`;
 * `DiscordCommunityCallout`'s community angle → `SocialProof.tsx`;
 * `PricingCallout`'s numbers → `FAQ.tsx`, with the full bundle breakdown
 * staying on the real `/pricing` page one link away, same as before.
 *
 * `PianoReveal`, right after Hero, is new: a scroll-scrubbed frame sequence
 * (see ScrollFrameSequence.tsx and PianoReveal's own comment), built from
 * real frames the user provided, not the earlier live-WebGL 3D piano
 * backdrop that was deliberately removed before this session. That removal
 * stands; this is a different, much lighter technique (baked images, no
 * Three.js), not a reversal of it.
 *
 * Everything else from the previous rebuild that this pass didn't touch:
 * `PageBackground`'s shader mesh still extends the whole page (PianoReveal's
 * own full-bleed frames simply cover it while that one section is pinned,
 * same as any other full-bleed section would), `PhoneCarousel`'s draggable
 * coverflow still lives inside `Solution` now instead of the retired
 * `ProductShowcase`, and every other section still reveals via
 * `ScrollGlassCard` as it scrolls into view.
 */
export function LandingPage() {
  return (
    <div className="relative">
      <PageBackground />
      <MarketingNav />

      {/* Skip-link target — see (marketing)/layout.tsx. tabIndex={-1} so
          focus actually lands here on activation; never in normal tab order
          otherwise. A real <main> now, not an empty placeholder div — axe's
          "region" check flagged every marketing page for having real content
          outside any landmark, since this id used to sit on an empty div
          instead of actually wrapping the content it pointed at. */}
      <main id="main-content" tabIndex={-1} className="outline-none">
        <Hero />
        <PianoReveal />
        <SocialProof />
        <ProblemStatement />
        <Solution />
        <HowItWorks />
        <FAQ />
        <FinalCTA />
      </main>

      <SiteFooter />
      <ScrollToTopButton />
    </div>
  );
}
