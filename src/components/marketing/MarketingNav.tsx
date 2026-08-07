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
      <div className="glass-pill mx-auto flex w-full items-center justify-between px-5 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-serif text-sm tracking-[0.2em] text-slate-100">
          <Image src="/logo-mark.png" alt="" width={26} height={26} className="h-[26px] w-[26px]" priority />
          BASS NOTE <span className="text-amber-400">PIANO</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-slate-200">
          {NAV_LINKS.filter((link) => link.href !== pathname).map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-amber-300">
              {link.label}
            </Link>
          ))}
          <Link
            href={isLoggedIn ? "/dashboard" : "/login"}
            className="rounded-full border border-white/15 px-4 py-1.5 text-slate-100 transition hover:border-amber-400/40 hover:text-amber-300"
          >
            {isLoggedIn ? "Dashboard" : "Log in"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
