import { ScrollGlassCard } from "@/components/marketing/ScrollGlassCard";
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
 * 21ST.DEV REDESIGN: was a centered heading over a 3-column grid. Rebuilt
 * as an asymmetric editorial split (Editorial Hero pattern, id 19075,
 * structural inspiration only, not its serif/landscape-image specifics,
 * and never applied to the piano Hero, which stays exactly as built). The
 * label now sits alone in a narrow column, pinned to the bottom of the row
 * on larger screens instead of lining up with the heading's top, the same
 * slightly off-kilter alignment the source pattern uses. The three proof
 * points moved from a 3-up grid to a single divided list, reading as one
 * continuous argument rather than three parallel cards.
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
    <section className="mx-auto max-w-5xl px-6 py-12 md:py-28">
      <ScrollGlassCard className="p-6 md:p-12" direction="left">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,200px)_1fr] lg:gap-16">
          <p className="label label-muted lg:self-end lg:pb-2">Why trust this</p>

          <div>
            <h2 className="display-2 max-w-[26ch] text-balance">
              Nothing here asks you to take our word for it.
            </h2>

            <div className="mt-10 divide-y divide-[rgb(var(--c-s-50)/0.08)] border-t border-[rgb(var(--c-s-50)/0.08)]">
              {PROOF_POINTS.map((point) => (
                <div key={point.label} className="flex flex-col gap-2 py-6 sm:flex-row sm:items-baseline sm:gap-8">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-[rgb(var(--c-a-300))] sm:w-32 sm:shrink-0">
                    {point.label}
                  </p>
                  <p className="max-w-[52ch] text-sm leading-relaxed text-slate-300">{point.body}</p>
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
        </div>
      </ScrollGlassCard>
    </section>
  );
}
