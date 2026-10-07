import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Hero } from "@/components/marketing/Hero";
import { Statement } from "@/components/marketing/Statement";
import { InstrumentPicker } from "@/components/marketing/InstrumentPicker";
import { SocialProof } from "@/components/marketing/SocialProof";
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
 * `Hero` went through several distinct versions this project's history: a
 * plain static section, the piano scroll sequence itself, a fixed-viewport
 * HUD hero with a cursor-driven reveal, and now a single restrained
 * cinematic hero (real piano photo full-bleed, one headline, one line, one
 * CTA), by direct instruction to study real premium sites and apply what
 * actually makes them feel that way rather than adding more visual effects.
 * See Hero.tsx's own comment for the current version's full reasoning.
 * Still this app's own real piano photography throughout every version,
 * not the earlier live-WebGL 3D piano backdrop removed earlier this
 * project's history, which none of these versions have been a reversal of.
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
 * PICKUPMUSIC.COM STRUCTURE PASS: section flow and one new section
 * (`InstrumentPicker`) adapted from pickupmusic.com's real landing page,
 * by direct instruction to mirror its flow ("copy the whole landing page
 * top to bottom... the text should match my bassnotepiano"). Not a literal
 * clone: three of that page's real sections have no honest BNP
 * equivalent and are deliberately not reproduced:
 *   - Customer testimonials: no real testimonials exist anywhere in this
 *     app's data (confirmed, PRODUCT.md's own "Evidence on Hand" section),
 *     and inventing any would break the standing "we do not lie" rule.
 *     `SocialProof` already fills this same trust-building slot in the
 *     page flow with facts that are actually true instead.
 *   - "91% improve / 4x faster" style stat callouts: no equivalent data
 *     exists in this app to verify numbers like that against.
 *   - The "full refund, no questions asked" guarantee: BNP's real policy
 *     is the opposite (the curriculum purchase is final once bought, see
 *     TermsContent.tsx and FAQ.tsx), so copying this section's content
 *     would state a policy this app doesn't actually have.
 * Everything else either already existed here with real content
 * (`SocialProof`, `Solution`, `HowItWorks`, `FAQ`) and is just reordered
 * to track pickupmusic.com's own flow more closely, or is genuinely new
 * (`InstrumentPicker`, see its own comment) built the same way: the
 * pattern borrowed, the words entirely BNP's own real facts.
 *
 * PIANOTE.COM STYLE PASS: `PageBackground` (the animated moving mesh-
 * gradient that used to extend behind the whole page) is deleted, by
 * direct instruction to remove it - the page now just shows the plain
 * static ground color every section already sits on via
 * `[data-surface="marketing"]`'s own background-color, with nothing
 * layered behind it. It had no other caller, so the file is gone rather
 * than kept as dead code. Separately, the nav wordmark (MarketingNav.tsx)
 * picked up pianote.com's own actual wordmark treatment (bold, lowercase,
 * studied directly) in place of the small label it used before - colored
 * in the accent at the time, now neutral again under the "premium black
 * and white" pass - see that file's own comment.
 *
 * SECTION BACKDROP PASS: the real photography that used to sit behind
 * /classes, /pricing, /shop and every auth screen (see backdrops.ts) is
 * removed from those pages and reused here instead, by direct
 * instruction, "casually" behind text that already existed rather than as
 * a new hero-style treatment. InstrumentPicker through FAQ now run a
 * repeating image -> blur -> blank -> blur -> image rhythm (full detail,
 * softened, plain ground, softened, full detail again), explicitly never
 * cutting directly between two different photos - Solution's screenshot
 * panel and FinalCTA's closing beat stay on plain ground throughout, the
 * "blank" beats the rhythm needs and, for Solution, the same "product
 * reveal keeps its own bounded surface" rule this file's STRUCTURE
 * REDESIGN pass already established. See InstrumentPicker.tsx's own
 * comment for the full reasoning and which photo runs where.
 */
export function LandingPage() {
  return (
    <div className="relative">
      <MarketingNav />

      {/* Skip-link target, see (marketing)/layout.tsx. tabIndex={-1} so
          focus actually lands here on activation; never in normal tab order
          otherwise. A real <main> now, not an empty placeholder div, axe's
          "region" check flagged every marketing page for having real content
          outside any landmark, since this id used to sit on an empty div
          instead of actually wrapping the content it pointed at. */}
      <main id="main-content" tabIndex={-1} className="outline-none">
        <Hero />
        <Statement />
        <InstrumentPicker />
        <Solution />
        <HowItWorks />
        <SocialProof />
        <FAQ />
        <FinalCTA />
      </main>

      <SiteFooter />
      <ScrollToTopButton />
    </div>
  );
}
