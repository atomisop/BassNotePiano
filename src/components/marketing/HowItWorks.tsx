import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { StepsLoop } from "@/components/marketing/loops";

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 md:py-40">
      <ScrollReveal className="grid items-center gap-12 md:grid-cols-[1fr_1.1fr] md:gap-20">
        <h2 className="text-[clamp(2.25rem,6vw,4.5rem)] font-bold leading-[1.02] tracking-[-0.03em] text-slate-50">
          Class.
          <br />
          Quiz.
          <br />
          <span className="text-slate-500">Badge.</span>
        </h2>
        <StepsLoop />
      </ScrollReveal>
    </section>
  );
}
