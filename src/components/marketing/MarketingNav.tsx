"use client";

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
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <Link href="/" className="font-serif text-sm tracking-[0.2em] text-slate-100">
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
          className="glass-pill px-4 py-1.5 text-slate-100 transition hover:text-amber-300"
        >
          {isLoggedIn ? "Dashboard" : "Log in"}
        </Link>
      </nav>
    </header>
  );
}
