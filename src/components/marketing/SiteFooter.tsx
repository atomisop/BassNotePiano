"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { GradientFooter } from "./GradientFooter";

// Every link here maps to a route that actually exists on this site —
// no invented Docs/Blog/Careers/Status columns, no email-signup box with
// nowhere real for it to go. "Account" swaps to a single Dashboard link
// once signed in, same logic SiteNavbar already uses.
const EXPLORE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/classes", label: "Live classes" },
  { href: "/pricing", label: "Pricing" },
];

const LEGAL_LINKS = [{ href: "/terms", label: "Terms & refund policy" }];

export function SiteFooter() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <GradientFooter className="relative border-t border-ink/5">
      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-16">
        <div className="grid grid-cols-1 gap-10 pb-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2 font-serif text-sm tracking-[0.15em] text-slate-100">
              <Image src="/logo-mark.png" alt="" width={24} height={24} className="h-6 w-6" />
              BASS NOTE <span className="text-amber-400">PIANO</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm text-slate-500">
              A digital companion to the Ethiopian Scales, Rhythm &amp; Chords curriculum book — six kiñit scales,
              spelled correctly in every key, plus live weekly classes on Zoom.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Explore</h3>
            <ul className="mt-4 flex flex-col gap-3 text-sm">
              {EXPLORE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-slate-500 transition hover:text-amber-300">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Account</h3>
            <ul className="mt-4 flex flex-col gap-3 text-sm">
              {isLoggedIn ? (
                <li>
                  <Link href="/dashboard" className="text-slate-500 transition hover:text-amber-300">
                    Dashboard
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link href="/login" className="text-slate-500 transition hover:text-amber-300">
                      Log in
                    </Link>
                  </li>
                  <li>
                    <Link href="/register" className="text-slate-500 transition hover:text-amber-300">
                      Create account
                    </Link>
                  </li>
                </>
              )}
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-slate-500 transition hover:text-amber-300">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-ink/5 py-6 text-center text-xs text-slate-600">
          © {new Date().getFullYear()} Bass Note Piano.
        </div>
      </div>
    </GradientFooter>
  );
}
