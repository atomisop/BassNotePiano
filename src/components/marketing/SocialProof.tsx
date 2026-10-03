import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { DiscordIcon } from "@/components/ui/icons";
import { DISCORD_INVITE_URL } from "@/lib/discord";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";

/**
 * HOMEPAGE REBUILD: 02 SOCIAL PROOF.
 *
 * Deliberately not testimonials, star ratings, or a student count: none of
 * those exist as real data anywhere in this app, and the direct instruction
 * for this rebuild was explicit ("we do not lie"). Every line below is a
 * fact anyone can verify themselves rather than a claim to take on faith:
 * the curriculum is a real published book (see SiteFooter's own copy), the
 * screenshots are real captures (see Solution.tsx), the Discord link
 * actually opens a real, active server, and "every key" is a checkable
 * claim against the actual scale data, not marketing language.
 *
 * REDESIGN: no glass-surface card. Uses marketing.css's own editorial-grid
 * and rule-hairline instead (see ScrollReveal's own comment for why): a
 * narrow label column beside a wider heading-and-list column, the proof
 * points separated by hairlines rather than boxed into a card.
 *
 * SECTION BACKDROP: the second beat of the homepage's image → blur → blank
 * → blur → image rhythm (see InstrumentPicker's own comment for the full
 * reasoning). It's the same guitar photo InstrumentPicker just showed at
 * full clarity, now heavily blurred and faded at both edges, so the photo
 * dissolves into color and light rather than cutting straight to
 * Solution's plain ground. Never a hard cut between two different images
 * anywhere on this page: always a strong blur and a fade to blank first.
 *
 * MOBILE FIX: both grid items below only ever had `md:col-span-*`, no base
 * span. `.editorial-grid` is a fixed 12-column grid at every width (see
 * marketing.css, no mobile-first collapse built in), so with no base span
 * a grid item defaults to just 1 of 12 columns below md: the label and the
 * entire proof-points column were each rendering in a sliver a few percent
 * of the screen wide, wrapping every word onto its own line. Reported as
 * "mobile is cooked", and this is what that actually was. `col-span-12`
 * added as the base so both stack full-width until md: takes over.
 */
const PROOF_POINTS = [
  {
    label: "The source",
    body: "Built from a real, published method book, Ethiopian Scales, Rhythm & Chords, not assembled from scattered tab sites.",
  },
  {
    label: "The teacher",
    body: "Live one-on-one and family lessons with an actual teacher over Discord, not a pre-recorded course.",
  },
  {
    label: "The coverage",
    body: "Every scale spelled correctly in all twelve keys, a claim you can check against the curriculum yourself.",
  },
];

export function SocialProof() {
  return (
    <section className="relative overflow-hidden py-[var(--space-5)] md:py-[var(--space-8)]">
      {/* Masked to fully transparent at both edges, on top of the blur and
          PhotoBackdrop's own scrim, belt and suspenders so this never
          reads as a hard cut against Solution's blank ground on either
          side. Never a bare image-to-image transition anywhere on this
          page: every image is either at full clarity with a blank section
          on both sides, or blurred and fading straight to blank, per
          direct instruction. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 overflow-hidden"
        style={{ maskImage: "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)" }}
      >
        <div className="absolute -inset-x-10 -inset-y-10 blur-3xl">
          <PhotoBackdrop src={BACKDROPS.guitar} scrim="standard" sizes="100vw" />
        </div>
      </div>
      <ScrollReveal className="editorial-grid">
        <p className="label label-muted col-span-12 md:col-span-3">Why trust this</p>

        <div className="col-span-12 md:col-span-9">
          <h2 className="display-2 max-w-[26ch] text-balance">Nothing here asks you to take our word for it.</h2>

          <div className="mt-10">
            <hr className="rule-hairline" />
            {PROOF_POINTS.map((point) => (
              <div key={point.label}>
                <div className="flex flex-col gap-2 py-6 sm:flex-row sm:items-baseline sm:gap-8">
                  <p className="label sm:w-32 sm:shrink-0">{point.label}</p>
                  <p className="body-copy max-w-[52ch]">{point.body}</p>
                </div>
                <hr className="rule-hairline" />
              </div>
            ))}
          </div>

          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-2 text-small font-medium text-[rgb(var(--c-s-50))] transition hover:opacity-70"
          >
            <DiscordIcon size={16} className="text-[#5865F2]" />
            See the community for yourself
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </ScrollReveal>
    </section>
  );
}
