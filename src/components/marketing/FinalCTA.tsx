"use client";

import { useSession } from "next-auth/react";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { WordsPullUp } from "@/components/ui/words-pull-up";
import { PillCTA } from "@/components/ui/pill-cta";

export function FinalCTA() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 md:py-40">
      <WordsPullUp
        text="You already knew the sound. Now you can play it."
        className="text-[clamp(2.75rem,8vw,7rem)] font-medium leading-[0.9] tracking-[-0.06em] text-[#E1E0CC]"
      />
      <ScrollReveal className="mt-10">
        <PillCTA href={isLoggedIn ? "/dashboard" : "/register"}>{isLoggedIn ? "Go to dashboard" : "Get started"}</PillCTA>
      </ScrollReveal>
    </section>
  );
}
