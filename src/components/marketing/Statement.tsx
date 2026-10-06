import { WordsPullUpMultiStyle } from "@/components/ui/words-pull-up";
import { ScrollText } from "@/components/ui/scroll-text";

export function Statement() {
  return (
    <section className="px-2 sm:px-3">
      <div className="mx-auto max-w-[96rem] rounded-2xl bg-black px-6 py-16 md:rounded-[2rem] md:px-14 md:py-28">
        <WordsPullUpMultiStyle
          className="text-[clamp(2.5rem,7vw,6rem)] font-medium leading-[0.92] tracking-[-0.05em]"
          segments={[
            { text: "Tabs teach you one song.", className: "text-[#E1E0CC]" },
            { text: "Not the language.", className: "text-[#E1E0CC]/40" },
          ]}
        />
        <ScrollText
          className="mt-12 max-w-3xl text-[clamp(1.125rem,2vw,1.625rem)] leading-[1.35] tracking-[-0.01em] text-[#E1E0CC]"
          text="Most music resources hand you a transcription of one specific piece. Learn it, and you can play that one song, in that one key. Try to play anything new, jam with someone, or transpose for a singer, and you're stuck: you memorized shapes, not the scale grammar underneath them. Bass Note Piano teaches the grammar, with a real teacher beside you."
        />
      </div>
    </section>
  );
}
