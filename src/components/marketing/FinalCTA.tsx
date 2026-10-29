"use client";

import { useSession } from "next-auth/react";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { WordsPullUp } from "@/components/ui/words-pull-up";
import { PillCTA } from "@/components/ui/pill-cta";

export function FinalCTA() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 py-28 text-center md:py-44">
      <WordsPullUp
        text="You already knew the sound. Now you can play it."
        className="justify-center text-[clamp(2.5rem,7vw,5.5rem)] font-semibold leading-[1] tracking-[-0.035em] text-cream"
      />
      <ScrollReveal className="mt-10">
        <PillCTA href={isLoggedIn ? "/dashboard" : "/register"}>{isLoggedIn ? "Go to dashboard" : "Get started"}</PillCTA>
      </ScrollReveal>
    </section>
  );
}
