import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { DiscordIcon } from "@/components/ui/icons";
import { DISCORD_INVITE_URL } from "@/lib/discord";

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
    body: "Every kiñit scale spelled correctly in all twelve keys, a claim you can check against the curriculum yourself.",
  },
];

export function SocialProof() {
  return (
    <section className="py-[var(--space-5)] md:py-[var(--space-8)]">
      <ScrollReveal className="editorial-grid">
        <p className="label label-muted md:col-span-3">Why trust this</p>

        <div className="md:col-span-9">
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
            className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-[rgb(var(--c-a-300))] transition hover:text-[rgb(var(--c-a-200))]"
          >
            <DiscordIcon size={16} />
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
