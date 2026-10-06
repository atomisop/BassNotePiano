import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { BookOpen, Video } from "lucide-react";
import { DiscordIcon } from "@/components/ui/icons";
import { ProofLoops } from "@/components/marketing/loops";
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

export function SocialProof() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 md:py-40">
      <ScrollReveal className="grid items-center gap-12 md:grid-cols-[1fr_1.1fr] md:gap-20">
        <h2 className="text-[clamp(2.25rem,6vw,4.5rem)] font-bold leading-[1.02] tracking-[-0.03em] text-slate-50">
          The
          <br />
          real thing.
        </h2>

        <div>
          <ProofLoops
            items={[
              { icon: <BookOpen className="h-7 w-7" strokeWidth={1.5} />, caption: "A real book" },
              { icon: <Video className="h-7 w-7" strokeWidth={1.5} />, caption: "A real teacher" },
              { icon: <DiscordIcon size={28} className="text-[#5865F2]" />, caption: "Real community" },
            ]}
          />

          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="tap mt-8 inline-flex items-center gap-2 text-small font-medium text-slate-300 transition hover:text-slate-50"
          >
            <DiscordIcon size={16} className="text-[#5865F2]" />
            Visit the community
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </ScrollReveal>
    </section>
  );
}
