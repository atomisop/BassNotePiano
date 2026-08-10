"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { SlideOverPanel } from "@/components/layout/SlideOverPanel";
import { NavIcon, ICON_PATHS } from "@/components/layout/navIcons";

// One icon per NAV_LINKS entry, keyed by href — the mobile slide-over lists
// these with an icon the way every other in-app nav list already does
// (MoreSheet, AccountSettings' mobile tab list); the desktop bar below
// doesn't use these at all, plain text links there matches the rest of the
// floating pill.
const LINK_ICON: Record<string, string> = {
  "/classes": ICON_PATHS.lessons,
  "/pricing": ICON_PATHS.pricing,
};

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
  const [menuOpen, setMenuOpen] = useState(false);

  // Excludes whichever of Classes/Pricing matches the current page — same
  // filter the inline sm:+ links use below, reused here so the mobile menu
  // never lists a link back to the page you're already on.
  const otherLinks = NAV_LINKS.filter((link) => link.href !== pathname);

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
              only room for identity + the one primary CTA without wrapping.
              The hamburger button below is the mobile equivalent, so these
              stay reachable rather than just disappearing. */}
          {otherLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hidden whitespace-nowrap transition hover:text-amber-300 sm:inline">
              {link.label}
            </Link>
          ))}
          {otherLinks.length > 0 && (
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Menu"
              aria-expanded={menuOpen}
              className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-200 transition hover:text-amber-300 sm:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <Link
            href={isLoggedIn ? "/dashboard" : "/login"}
            className="whitespace-nowrap rounded-full border border-ink/10 px-3 py-1.5 text-xs text-slate-100 transition hover:border-amber-400/40 hover:text-amber-300 sm:px-4 sm:text-sm"
          >
            {isLoggedIn ? "Dashboard" : "Log in"}
          </Link>
        </nav>
      </div>

      {/* Full slide-over instead of a small anchored dropdown — same panel
          every other in-app menu list already uses (MoreSheet's dashboard
          equivalent, AccountSettings' mobile tabs), so this reads as the
          same app rather than a lighter-weight marketing-only menu. */}
      <SlideOverPanel open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <div className="-m-6 space-y-1 p-3">
          {otherLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm text-slate-200 transition hover:bg-ink/5"
            >
              <NavIcon path={LINK_ICON[link.href]} className="h-5 w-5 shrink-0 text-slate-400" />
              {link.label}
            </Link>
          ))}
          <Link
            href={isLoggedIn ? "/dashboard" : "/login"}
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm text-slate-200 transition hover:bg-ink/5"
          >
            <NavIcon path={ICON_PATHS.profile} className="h-5 w-5 shrink-0 text-slate-400" />
            {isLoggedIn ? "Dashboard" : "Log in"}
          </Link>
        </div>
      </SlideOverPanel>
    </header>
  );
}
