import { QUIZ_PASS_THRESHOLD } from "@/lib/access";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { Timeline } from "@/components/ui/Timeline";
import { WordsPullUp } from "@/components/ui/words-pull-up";

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

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 md:py-40">
      <div className="grid grid-cols-1 gap-14 md:grid-cols-12">
        <div className="min-w-0 md:col-span-5">
          <p className="mb-4 text-small uppercase tracking-[0.18em] text-[#E1E0CC]/50">How it works</p>
          <WordsPullUp
            text="Four steps."
            className="text-[clamp(2.5rem,6vw,5rem)] font-medium leading-[0.92] tracking-[-0.05em] text-[#E1E0CC]"
          />
        </div>
        <ScrollReveal className="min-w-0 md:col-span-7">
          <Timeline entries={STEPS} />
        </ScrollReveal>
      </div>
    </section>
  );
}
