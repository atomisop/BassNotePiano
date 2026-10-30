import { WordsPullUpMultiStyle } from "@/components/ui/words-pull-up";
import { ScrollText } from "@/components/ui/scroll-text";

export function Statement() {
  return (
    <section>
      <div className="bg-black px-6 py-24 text-center md:py-40"><div className="mx-auto max-w-4xl">
        <WordsPullUpMultiStyle
          className="justify-center text-[clamp(2.25rem,6vw,5rem)] font-semibold leading-[1] tracking-display"
          segments={[
            { text: "Tabs teach you one song.", className: "text-cream" },
            { text: "Not the language.", className: "text-cream/40" },
          ]}
        />
        <ScrollText
          className="mx-auto mt-10 max-w-2xl text-[clamp(1.0625rem,1.8vw,1.375rem)] leading-[1.4] tracking-tight text-cream/75"
          text="Most music resources hand you a transcription of one specific piece. Learn it, and you can play that one song, in that one key. Try to play anything new, jam with someone, or transpose for a singer, and you're stuck: you memorized shapes, not the scale grammar underneath them. Bass Note Piano teaches the grammar, with a real teacher beside you."
        />
      </div></div>
    </section>
  );
}
