import { TextReveal } from "@/components/ui/text-reveal";

/** One large sentence, in two tones, that sets up everything below it. */
export function Statement() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 md:py-40">
      <p className="max-w-[22ch] text-[clamp(2rem,6.2vw,4.75rem)] font-bold leading-[1.04] tracking-[-0.03em] md:max-w-[26ch]">
        <TextReveal text="Learn piano, guitar and bass with a real teacher, live." className="text-slate-50" />{" "}
        <TextReveal text="One scale at a time." className="text-slate-500" delay={0.9} />
      </p>
    </section>
  );
}
