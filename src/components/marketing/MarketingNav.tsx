"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

// Shared across every marketing page (/, /classes, /pricing) so the
// logged-in-vs-logged-out check only has to be correct in one place —
// previously each page duplicated this header and only the homepage
// actually checked useSession(), so a signed-in visitor still saw a
// "Log in" link (routing them back through /login) on /classes and
// /pricing. The current page's own link is omitted from the nav rather
// than hardcoded per page.
const NAV_LINKS = [
  { href: "/classes", label: "Classes" },
  { href: "/pricing", label: "Pricing" },
];

export function MarketingNav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const isLoggedIn = Boolean(session?.user);

  return (
    <header className="fixed inset-x-0 top-4 z-30 mx-auto w-full max-w-6xl px-4 sm:top-6 sm:px-6">
      {/* Fixed, not sticky — position:sticky silently stops sticking once its
          direct parent has overflow-hidden and never scrolls on its own
          (the page's real scroll happens on <body>, not this div), which is
          exactly this app's layout everywhere a photo backdrop needs
          clipping. Fixed has no such ancestor sensitivity here (verified no
          ancestor sets transform/filter/perspective, which is the one thing
          that would break fixed too). Callers add top padding to their
          first content block to reserve the space this removes from flow. */}
      {/* Floating "island" nav — a glass-pill capsule inset from the top and
          sides, rather than a bar docked flush to the viewport edge. */}
      <div className="glass-pill mx-auto flex w-full items-center justify-between gap-3 px-3 py-2.5 sm:gap-4 sm:px-6 sm:py-3">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-serif text-xs tracking-[0.1em] text-slate-100 sm:gap-2 sm:text-sm sm:tracking-[0.2em]"
        >
          <Image src="/logo-mark.png" alt="" width={26} height={26} className="h-[22px] w-[22px] sm:h-[26px] sm:w-[26px]" priority />
          BASS NOTE <span className="text-amber-400">PIANO</span>
        </Link>
        <nav className="flex shrink-0 items-center gap-3 text-sm text-slate-200 sm:gap-6">
          {/* Secondary nav links hidden below sm — at mobile widths there's
              only room for identity + the one primary CTA without wrapping;
              Classes/Pricing stay reachable via the hero's own "See pricing"
              link and elsewhere, not orphaned. */}
          {NAV_LINKS.filter((link) => link.href !== pathname).map((link) => (
            <Link key={link.href} href={link.href} className="hidden whitespace-nowrap transition hover:text-amber-300 sm:inline">
              {link.label}
            </Link>
          ))}
          <Link
            href={isLoggedIn ? "/dashboard" : "/login"}
            className="whitespace-nowrap rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-100 transition hover:border-amber-400/40 hover:text-amber-300 sm:px-4 sm:text-sm"
          >
            {isLoggedIn ? "Dashboard" : "Log in"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
