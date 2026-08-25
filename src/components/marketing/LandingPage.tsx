import { PageBackground } from "@/components/marketing/PageBackground";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Hero } from "@/components/marketing/Hero";
import { WhatBassNoteIs } from "@/components/marketing/WhatBassNoteIs";
import { CurriculumOverview } from "@/components/marketing/CurriculumOverview";
import { ProductShowcase } from "@/components/marketing/ProductShowcase";
import { ClassesOverview } from "@/components/marketing/ClassesOverview";
import { DiscordCommunityCallout } from "@/components/marketing/DiscordCommunityCallout";
import { PricingCallout } from "@/components/marketing/PricingCallout";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { ScrollToTopButton } from "@/components/marketing/ScrollToTopButton";

/**
 * HOMEPAGE REPLACEMENT — complete rebuild, per explicit direction:
 * "delete the existing homepage presentation... do not preserve the
 * current homepage JSX, layout, animation system, or visual composition."
 *
 * Gone for good: the persistent 3D piano backdrop (`PianoBackdrop`/
 * `PianoBackdropCanvas`), every pinned/scroll-driven scene (`HeroScene`,
 * `PianoScene`, `KeyboardScene`, `KinitJourney`), and the bento grid
 * (`BentoFeatures`). None of that was low-quality work — it just isn't
 * what this rebuild is building.
 *
 * Two things this comment used to list as "gone" have since come back, by
 * later direct instruction, and are NOT stale leftovers:
 *   - `PhoneCarousel`'s draggable 3D coverflow interaction — restored
 *     (from git history, its deletion was never committed) and live inside
 *     `ProductShowcase` again, not just its screenshots.
 *   - Scroll-triggered reveals — every section from `WhatBassNoteIs` down
 *     through `FinalCTA` now fades/slides in via `ScrollGlassCard` as it
 *     scrolls into view. Not the old `RevealFromSide`/`TextShelf` (still
 *     gone), a new, separate mechanism built for this rebuild.
 *
 * Otherwise still real Bass Note content throughout (nothing invented —
 * see each section's own comment for where its copy/data came from).
 * Structural reference: the `header-2` nav pattern (scroll-compact sticky
 * header, clean links, mobile drawer) adapted into `MarketingNav`, and the
 * restrained split-hero genre `ShaderShowcase`-style components share
 * (large headline, one visual, generous whitespace) — colors and effects
 * are pure Bass Note, not copied from either reference.
 *
 * `PageBackground` extends that shader background to the entire page (it
 * used to be scoped to `Hero` alone) — mounted first, `fixed`, behind
 * everything, per direct instruction.
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
        <WhatBassNoteIs />
        <CurriculumOverview />
        <ProductShowcase />
        <ClassesOverview />
        <DiscordCommunityCallout />
        <PricingCallout />
        <FinalCTA />
      </main>

      <SiteFooter />
      <ScrollToTopButton />
    </div>
  );
}
