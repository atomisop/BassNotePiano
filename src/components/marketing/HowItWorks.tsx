import { QUIZ_PASS_THRESHOLD } from "@/lib/access";
import { ScrollTimeline } from "@/components/ui/scroll-timeline";

const STEPS = [
  {
    marker: "01",
    title: "Start live classes",
    description: "Pick a weekly class plan. The curriculum comes with it, opened one scale at a time as you and your teacher move through it.",
  },
  {
    marker: "02",
    title: "Work through it at your pace",
    description: `Read the lesson, practice, then pass its quiz at ${Math.round(QUIZ_PASS_THRESHOLD * 100)}% before your teacher opens the next scale.`,
  },
  {
    marker: "03",
    title: "Meet your teacher every week",
    description: "Your weekly day and time is reserved for you, one-on-one or as a family session, live on Discord. Need more time? Book an extra class.",
  },
  {
    marker: "04",
    title: "Watch it add up",
    description: "Streaks, badges, and a roadmap that remembers exactly where you stopped and what opens next.",
  },
];

/**
 * From md up the four steps ride the pinned sideways timeline. On a phone that timeline was three screens of near-empty black
 * with a "Keep scrolling" hint (2026-11-02 audit), so a phone gets the same four steps as a plain list that scrolls like the
 * rest of the page. Both are rendered and CSS picks one; the timeline's own scroll pin is also limited to md and up.
 */
export function HowItWorks() {
  return (
    <>
      <section aria-label="How it works" className="px-6 py-20 md:hidden">
        <p className="text-small uppercase tracking-caps text-cream/60">How it works</p>
        <h2 className="mt-3 text-[clamp(3rem,14vw,5rem)] font-medium leading-[0.9] tracking-[-0.05em] text-cream">Four steps.</h2>
        <ol className="mt-10 flex flex-col gap-8">
          {STEPS.map((step) => (
            <li key={step.marker} className="flex gap-4 border-t border-cream/10 pt-6">
              <span className="font-mono text-small text-amber-400">{step.marker}</span>
              <div>
                <h3 className="text-title font-medium leading-tight text-cream">{step.title}</h3>
                <p className="mt-2 text-small leading-relaxed text-cream/70">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <div className="hidden md:block">
        <ScrollTimeline label="How it works" title="Four steps." steps={STEPS} />
      </div>
    </>
  );
}
