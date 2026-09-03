import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { QUIZ_PASS_THRESHOLD } from "@/lib/access";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { Timeline } from "@/components/ui/Timeline";

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
    <section className="mx-auto max-w-3xl px-6 py-[var(--space-5)] md:py-[var(--space-8)]">
      <ScrollReveal>
        <p className="label label-muted">How it works</p>
        <h2 className="display-2 mt-4 max-w-[22ch] text-balance">Four steps. No fixed schedule to commit to.</h2>

        <div className="mt-12">
          <Timeline entries={STEPS} />
        </div>
      </ScrollReveal>
    </section>
  );
}
