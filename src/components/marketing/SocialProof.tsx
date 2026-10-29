import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { DiscordIcon } from "@/components/ui/icons";
import { DISCORD_INVITE_URL } from "@/lib/discord";
import { WordsPullUp } from "@/components/ui/words-pull-up";

const PROOF_POINTS = [
  {
    label: "The source",
    body: "Built from a real, published method book, not assembled from scattered tab sites.",
  },
  {
    label: "The teacher",
    body: "Live one-on-one and family lessons with an actual teacher over Discord, not a pre-recorded course.",
  },
  {
    label: "The coverage",
    body: "Every scale spelled correctly in all twelve keys, a claim you can check against the curriculum yourself.",
  },
];

export function SocialProof() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-24 md:pb-40">
      <WordsPullUp
        text="Nothing here asks you to take our word for it."
        className="max-w-[18ch] text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[1] tracking-display text-cream"
      />
      <ScrollReveal className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {PROOF_POINTS.map((point, i) => (
          <div key={point.label} className="rounded-2xl bg-black p-6 md:p-8">
            <p className="font-mono text-small text-amber-400">0{i + 1}</p>
            <p className="mt-10 text-xl font-medium tracking-tight text-cream">{point.label}</p>
            <p className="mt-2 text-small leading-relaxed text-cream/60">{point.body}</p>
          </div>
        ))}
      </ScrollReveal>

      <a
        href={DISCORD_INVITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="tap mt-8 inline-flex items-center gap-2 text-small font-medium text-slate-200 transition hover:opacity-70"
      >
        <DiscordIcon size={16} className="text-[#5865F2]" />
        See the community for yourself
      </a>
    </section>
  );
}
