import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { QUIZ_PASS_THRESHOLD } from "@/lib/access";
import { ScrollGlassCard } from "@/components/marketing/ScrollGlassCard";

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
 */
function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const STEPS = [
  {
    marker: "01",
    title: "Unlock the curriculum",
    body: `One payment of ${formatUsd(CURRICULUM_PRICE_CENTS)}, no subscription, and every scale group is available immediately.`,
  },
  {
    marker: "02",
    title: "Work through it at your pace",
    body: `Read the lesson, practice, then pass its quiz at ${Math.round(QUIZ_PASS_THRESHOLD * 100)}% before the next scale unlocks.`,
  },
  {
    marker: "03",
    title: "Book live time when you want it",
    body: "One-on-one or a family session with your teacher, whenever you're ready, not on a fixed weekly slot you have to keep.",
  },
  {
    marker: "04",
    title: "Watch it add up",
    body: "Streaks, badges, and a roadmap that remembers exactly where you stopped and what opens next.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12 md:py-28">
      <ScrollGlassCard className="p-6 md:p-12" direction="left">
        <p className="label label-muted">How it works</p>
        <h2 className="display-2 mt-4 max-w-[22ch] text-balance">Four steps. No fixed schedule to commit to.</h2>

        <ol className="mt-12 divide-y divide-[rgb(var(--c-s-50)/0.08)] border-t border-[rgb(var(--c-s-50)/0.08)]">
          {STEPS.map((step) => (
            <li key={step.marker} className="flex flex-col gap-2 py-7 sm:flex-row sm:items-baseline sm:gap-8">
              <span className="font-mono text-sm text-[rgb(var(--c-a-300)/0.8)] sm:w-16 sm:shrink-0">{step.marker}</span>
              <h3 className="font-serif text-xl text-slate-50 sm:w-48 sm:shrink-0">{step.title}</h3>
              <p className="max-w-[52ch] text-sm leading-relaxed text-slate-400">{step.body}</p>
            </li>
          ))}
        </ol>
      </ScrollGlassCard>
    </section>
  );
}
