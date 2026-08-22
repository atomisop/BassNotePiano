import { SCALE_GROUPS } from "@/lib/curriculum";
import { ScrollGlassCard } from "@/components/marketing/ScrollGlassCard";

/**
 * HOMEPAGE REPLACEMENT — 03 CURRICULUM.
 *
 * Typography and spacing, not the old `KinitJourney` spine or the master
 * doc's earlier animated-roadmap concept — per the explicit instruction for
 * this rebuild. Five real stages (Foundation → Scales → Chords →
 * Progression → Mastery) is this session's own organization of the real
 * curriculum, not an invented framework: `SCALE_GROUPS` genuinely has one
 * foundational, non-kiñit group (scale-0) followed by five kiñit-based
 * scale groups; the chord/progression/mastery mechanics are the same real
 * facts the old homepage's "method" Timeline and BentoFeatures' "Progress"
 * cell already stated (nothing new invented for this section).
 */

const foundation = SCALE_GROUPS.find((g) => g.slug === "scale-0");
const kinits = SCALE_GROUPS.filter((g) => g.kinitName);
// Distinct kiñit identities, not distinct rows — scale-2 and scale-3 are
// both "Bati" (minor and its variants), same as the homepage hero copy's
// "Six kiñit scales — Tizita, Bati, Anchihoye, Mixolydian" only names four.
const kinitNames = Array.from(new Set(kinits.map((g) => g.kinitName!.split(" ")[0])));

const STAGES = [
  {
    marker: "01",
    title: "Foundation",
    body: foundation?.title ?? "Diatonic Scale, Chromatic Scale & the Seven Modes",
  },
  {
    marker: "02",
    title: "Scales",
    body: `${kinitNames.length} real kiñits, each a different way of choosing five notes out of twelve — ${kinitNames.join(", ")}.`,
  },
  {
    marker: "03",
    title: "Chords",
    body: "Each kiñit's native chords are already inside its five notes — no separate chord theory to learn.",
  },
  {
    marker: "04",
    title: "Progression",
    body: "The same loop for every scale: work the module, log the practice, pass the quiz at 80%.",
  },
  {
    marker: "05",
    title: "Mastery",
    body: "Streaks, badges, and a roadmap that remembers exactly where you stopped and what opens next.",
  },
];

export function CurriculumOverview() {
  return (
    <section id="curriculum" className="mx-auto max-w-5xl scroll-mt-24 px-6 py-20 md:py-28">
      <ScrollGlassCard className="p-8 md:p-12" direction="left">
        <p className="label label-muted">Curriculum</p>
        <h2 className="display-2 mt-4 max-w-[24ch] text-balance">
          Six scale groups, one connected path.
        </h2>

        <ol className="mt-14 divide-y divide-[rgb(var(--c-s-50)/0.08)] border-t border-[rgb(var(--c-s-50)/0.08)]">
          {STAGES.map((stage) => (
            <li key={stage.marker} className="flex flex-col gap-2 py-7 sm:flex-row sm:items-baseline sm:gap-8">
              <span className="font-mono text-sm text-[rgb(var(--c-a-300)/0.8)] sm:w-16 sm:shrink-0">{stage.marker}</span>
              <h3 className="font-serif text-xl text-slate-50 sm:w-48 sm:shrink-0">{stage.title}</h3>
              <p className="max-w-[52ch] text-sm leading-relaxed text-slate-400">{stage.body}</p>
            </li>
          ))}
        </ol>
      </ScrollGlassCard>
    </section>
  );
}
