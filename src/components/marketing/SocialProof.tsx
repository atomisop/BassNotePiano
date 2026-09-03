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
 * screenshots below are real captures (see ProductShowcase's own comment on
 * where they come from), the Discord link actually opens a real, active
 * server, and "every key" is a checkable claim against the actual scale
 * data, not marketing language.
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
    <section className="mx-auto max-w-4xl px-6 py-12 md:py-28">
      <ScrollGlassCard className="p-6 md:p-12" direction="left">
        <p className="label label-muted">Why trust this</p>
        <h2 className="display-2 mt-4 max-w-[26ch] text-balance">
          Nothing here asks you to take our word for it.
        </h2>

        <div className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
          {PROOF_POINTS.map((point) => (
            <div key={point.label}>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[rgb(var(--c-a-300))]">
                {point.label}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{point.body}</p>
            </div>
          ))}
        </div>

        <a
          href={DISCORD_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-10 inline-flex items-center gap-2 text-sm font-medium text-[rgb(var(--c-a-300))] transition hover:text-[rgb(var(--c-a-200))]"
        >
          <DiscordIcon size={16} />
          See the community for yourself
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </ScrollGlassCard>
    </section>
  );
}
