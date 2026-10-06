import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { DiscordIcon } from "@/components/ui/icons";
import { DISCORD_INVITE_URL } from "@/lib/discord";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";
import { EDGE_FADE_STYLE } from "./edgeFade";

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
    body: "Built from a real, published method book.",
  },
  {
    label: "The teacher",
    body: "Live lessons with a real teacher over Discord.",
  },
  {
    label: "The coverage",
    body: "Every scale spelled correctly in all twelve keys.",
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
        style={EDGE_FADE_STYLE}
      >
        <div className="absolute -inset-x-10 -inset-y-10 blur-3xl">
          <PhotoBackdrop src={BACKDROPS.guitar} scrim="standard" sizes="100vw" />
        </div>
      </div>
      <ScrollReveal className="editorial-grid items-start">
        <h2 className="display-2 col-span-12 text-balance md:col-span-5">Nothing here asks you to take our word for it.</h2>

        <div className="col-span-12 md:col-span-6 md:col-start-7">
          <ul className="flex flex-col gap-8">
            {PROOF_POINTS.map((point) => (
              <li key={point.label} className="body-copy max-w-[52ch]">
                <span className="font-semibold text-slate-50">{point.label}. </span>
                {point.body}
              </li>
            ))}
          </ul>

          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="tap mt-8 inline-flex items-center gap-2 text-small font-medium text-[rgb(var(--c-s-50))] transition hover:opacity-70"
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
