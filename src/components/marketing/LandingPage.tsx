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
 * `Hero` went through several distinct versions this project's history:
 * a plain static section, then the piano scroll sequence itself (folding
 * in the short-lived separate `PianoReveal` file), and now a fixed-
 * viewport HUD hero with a cursor-driven reveal instead of a scroll-driven
 * one, by direct instruction ("use all of it except the picture," referring
 * to a UI/button/layout brief for an unrelated product page). See Hero.tsx's
 * own comment for the current version's full reasoning. Still built from
 * this app's own real piano photography (now the two states of the cursor
 * reveal, not a 65-frame scroll sequence), not the earlier live-WebGL 3D
 * piano backdrop removed earlier this project's history, which none of
 * these versions have been a reversal of.
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
 * STRUCTURE REDESIGN: the 21st.dev pass above still wrapped every section
 * in a `ScrollGlassCard` (a glass-surface card that also drove the scroll
 * reveal), by direct feedback ("still don't like it" / "use one uniform
 * design language"). marketing.css's own "STRUCTURE" comment had already
 * specified the actual intended system before any of these sections existed
 * ("Rules, not boxes... a card is reserved for the product reveal, where a
 * bounded surface is literally what is being shown"): the glass-card-per-
 * section pattern was exactly what that comment was written to rule out,
 * just never implemented in the components until now. Every section below
 * `Hero` now uses `ScrollReveal` (the animation half of `ScrollGlassCard`,
 * with no card) plus marketing.css's own `.editorial-grid` /
 * `.rule-hairline` for layout. Only `Solution`'s screenshot panel keeps a
 * bounded surface, since that one is the actual "product reveal" the rule
 * names as the exception. `ScrollGlassCard.tsx` had no callers left after
 * this pass and is deleted rather than kept as dead code.
 *
 * Everything else from the previous rebuild that this pass didn't touch:
 * `PageBackground`'s shader mesh still extends the whole page (Hero's own
 * opaque full-viewport background simply covers it for that one section,
 * same as any full-bleed section would).
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
