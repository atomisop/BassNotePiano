"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

// Matches Hero.tsx's own local copy — no shared `@/lib/format` module
// exists in this codebase to import instead (checked before adding this).
/**
 * HOMEPAGE REPLACEMENT — 07 FINAL CTA.
 *
 * Kept the file (it's a small, real, working closing beat).
 *
 * REDESIGN: no glass-surface card. A closing headline and one button is
 * already the simplest possible content on the page; a card around it adds
 * a boundary the content does nothing to earn. Keeps the scroll-triggered
 * reveal (ScrollReveal, the animation half of what ScrollGlassCard used to
 * do here), just without the box.
 */
export function FinalCTA() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <section className="mx-auto max-w-2xl px-6 py-[var(--space-6)] text-center md:py-[var(--space-8)]">
      <ScrollReveal>
        <p className="display-2 text-balance text-[rgb(var(--c-s-50))]">
          You already knew the sound.
          <br />
          Now you can play it.
        </p>

        <Link href={isLoggedIn ? "/dashboard" : "/register"} className="btn btn-primary group mt-8 inline-flex">
          {isLoggedIn ? "Go to dashboard" : "Start learning live"}
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            className="ml-1 transition-transform duration-300 group-hover:translate-x-1"
          >
            <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </ScrollReveal>
    </section>
  );
}
