import { WordsPullUpMultiStyle } from "@/components/ui/words-pull-up";

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
      </div>
    </section>
  );
}
