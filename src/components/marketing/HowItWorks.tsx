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

export function HowItWorks() {
  return <ScrollTimeline label="How it works" title="Four steps." steps={STEPS} />;
}
