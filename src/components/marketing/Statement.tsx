import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { WordsPullUpMultiStyle } from "@/components/ui/words-pull-up";

export function Statement() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 md:py-40">
      <WordsPullUpMultiStyle
        className="text-[clamp(2.5rem,7.5vw,6.5rem)] font-medium leading-[0.92] tracking-[-0.05em]"
        segments={[
          { text: "Tabs teach you one song.", className: "text-[#E1E0CC]" },
          { text: "Not the language.", className: "text-[#E1E0CC]/40" },
        ]}
      />
      <ScrollReveal className="mt-10 grid grid-cols-1 md:grid-cols-12">
        <p className="text-body leading-relaxed text-slate-300 md:col-span-6 md:col-start-7">
          Most music resources hand you a transcription of one specific piece. Learn it, and you can play that one song, in that one key.
          Try to play anything new, jam with someone, or transpose for a singer, and you&apos;re stuck: you memorized shapes, not the scale
          grammar underneath them. Bass Note Piano teaches the grammar, with a real teacher beside you.
        </p>
      </ScrollReveal>
    </section>
  );
}
