"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { CURRICULUM_PRICE_CENTS } from "@/lib/curriculum";
import { ScrollGlassCard } from "@/components/marketing/ScrollGlassCard";

// Matches Hero.tsx's own local copy — no shared `@/lib/format` module
// exists in this codebase to import instead (checked before adding this).
function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * HOMEPAGE REPLACEMENT — 07 FINAL CTA.
 *
 * Kept the file (it's a small, real, working closing beat). Wrapped in
 * `ScrollGlassCard` now, by direct instruction — a deliberate reversal of
 * this section's own earlier "no scroll-triggered entrance animation"
 * rule, the same way `WhatBassNoteIs` and every section below it now work.
 */
export function FinalCTA() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <section className="mx-auto max-w-2xl px-6 py-14 text-center md:py-32">
      <ScrollGlassCard className="p-6 md:p-12" direction="up">
        <p className="display-2 text-balance text-[rgb(var(--c-s-50))]">
          You already knew the sound.
          <br />
          Now you can play it.
        </p>

        <Link href={isLoggedIn ? "/dashboard" : "/register"} className="btn btn-primary group mt-8 inline-flex">
          {isLoggedIn ? "Go to dashboard" : `Start learning for ${formatUsd(CURRICULUM_PRICE_CENTS)}`}
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
      </ScrollGlassCard>
    </section>
  );
}
