import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { QUIZ_PASS_THRESHOLD } from "@/lib/access";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { Timeline } from "@/components/ui/Timeline";
import { BACKDROPS } from "@/lib/backdrops";
import { PhotoBackdrop } from "@/components/ui/PhotoBackdrop";

/**
 * HOMEPAGE REBUILD: 05 HOW IT WORKS.
 *
 * Retires CurriculumOverview: that section's five stages (Foundation →
 * Scales → Chords → Progression → Mastery) described WHAT the curriculum
 * covers, which now lives in Solution.tsx's feature list, so repeating it
 * here under a different heading would just say the same thing twice in a
 * row. This section answers a different question instead: the actual
 * step-by-step process of using the product, the "how easy this is to
 * commit to" beat the rebuild's template calls for. Four real steps, not
 * an invented framework: one-time payment (curriculum.ts), quiz-gated
 * progression at the real 80% threshold (access.ts's QUIZ_PASS_THRESHOLD),
 * live booking (classSchedule.ts), and the existing streak/badge/roadmap
 * system (gamification.ts, ScaleRoadmap.tsx).
 *
 * REDESIGN: no glass-surface card here either: a connected-dot timeline is
 * already exactly "position, scale, and a hairline" (marketing.css's own
 * structural rule), so it never needed boxing into a card in the first
 * place. Uses @/components/ui/Timeline, an existing component in this repo
 * already built and documented for exactly this ("Narrative timeline for
 * the marketing 'how this works' sequence") and already used by
 * KinitJourney, rather than inventing a second implementation.
 *
 * SECTION BACKDROP: third beat of the homepage's image → blur → blank →
 * blur → image rhythm (see InstrumentPicker's own comment). Solution just
 * ran fully blank; this section blurs the sheet-music photo IN, easing
 * toward ProblemStatement's full-clarity use of that same image, the
 * mirror of how SocialProof blurred the guitar photo back out after
 * InstrumentPicker.
 */
function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const STEPS = [
  {
    marker: "01",
    title: "Unlock the curriculum",
    description: `One payment of ${formatUsd(CURRICULUM_PRICE_CENTS)}, no subscription, and every scale group is available immediately.`,
  },
  {
    marker: "02",
    title: "Work through it at your pace",
    description: `Read the lesson, practice, then pass its quiz at ${Math.round(QUIZ_PASS_THRESHOLD * 100)}% before the next scale unlocks.`,
  },
  {
    marker: "03",
    title: "Book live time when you want it",
    description: "One-on-one or a family session with your teacher, whenever you're ready, not on a fixed weekly slot you have to keep.",
  },
  {
    marker: "04",
    title: "Watch it add up",
    description: "Streaks, badges, and a roadmap that remembers exactly where you stopped and what opens next.",
  },
];

export function HowItWorks() {
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
          <PhotoBackdrop src={BACKDROPS.classes} scrim="standard" sizes="100vw" />
        </div>
      </div>
      <ScrollReveal className="mx-auto max-w-3xl px-6">
        <p className="label label-muted">How it works</p>
        <h2 className="display-2 mt-4 max-w-[22ch] text-balance">Four steps. No fixed schedule to commit to.</h2>

        <div className="mt-12">
          <Timeline entries={STEPS} />
        </div>
      </ScrollReveal>
    </section>
  );
}
