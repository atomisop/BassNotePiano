import { PageBackground } from "@/components/marketing/PageBackground";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Hero } from "@/components/marketing/Hero";
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
 * `Hero` is now the piano scroll sequence itself, by direct instruction,
 * not a plain static section followed by a separate reveal section (an
 * earlier pass here briefly had it as two sections, `Hero` then
 * `PianoReveal`; `PianoReveal` no longer exists as its own file, folded
 * into `Hero.tsx`, which now renders `ScrollFrameSequence` directly with
 * two staged text beats, over just the lid opening, not a full exploded-
 * parts reveal (see Hero.tsx's own comment for why that got cut). Built
 * from real frames the user provided, not the earlier live-WebGL 3D piano
 * backdrop that was deliberately removed before this session. That
 * removal stands; this is a different, much
 * lighter technique (baked images, no Three.js), not a reversal of it.
 *
 * 21ST.DEV REDESIGN: Solution and HowItWorks were rebuilt again in this
 * pass (Feature Showcase and Timeline patterns, adapted; see each file's
 * own comment), and SocialProof moved from a centered heading + 3-col grid
 * to an asymmetric editorial split (Editorial Hero pattern, structural
 * inspiration only, applied here rather than to the piano Hero itself,
 * which stays as built). ProblemStatement deliberately did not get the same
 * split treatment: it works as a single short, centered statement, a
 * quiet beat between SocialProof and Solution, and forcing every section
 * into the same asymmetric shape would trade that variety for uniformity.
 * `PhoneCarousel`'s draggable coverflow is gone along with it: Solution's
 * two real screenshots now switch via a plain tab control instead, and
 * PhoneCarousel had no other caller, so the file was deleted rather than
 * left as dead code.
 *
 * Everything else from the previous rebuild that this pass didn't touch:
 * `PageBackground`'s shader mesh still extends the whole page (Hero's own
 * full-bleed frames simply cover it while pinned, same as any full-bleed
 * section would), and every section from `SocialProof` down still reveals
 * via `ScrollGlassCard` as it scrolls into view.
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
