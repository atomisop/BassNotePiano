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
    // minReveal={0}: the band defaults to 0.05, which is 5% of a 40vh glow —
    // about 21px of blurred warm light pinned to the bottom of the viewport
    // at ALL times, on every marketing page, at every scroll position. On the
    // homepage that reads as a rendering artifact rather than a flourish (it
    // was mistaken for a video decode bug during review), and it sits directly
    // under the hero's masthead strip. At 0 the glow still rises to full as
    // the footer comes into view — the effect is intact, it just stops
    // intruding on the other nine-tenths of the page.
    <GradientFooter minReveal={0} className="relative border-t border-ink/5">
      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-16">
        <div className="grid grid-cols-1 gap-10 pb-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2 font-serif text-sm tracking-[0.15em] text-slate-100">
              <Image src="/logo-mark.png" alt="" width={24} height={24} className="h-6 w-6" />
              BASS NOTE <span className="text-[rgb(var(--c-a-400))]">PIANO</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm text-slate-500">
              A digital companion to the Ethiopian Scales, Rhythm &amp; Chords curriculum book — six kiñit scales,
              spelled correctly in every key, plus live weekly classes on Zoom.
            </p>
          </div>

          <div>
            {/* h2, not h3: this footer renders on pages whose only other
                heading is the h1 (/classes, /terms), so an h3 here skipped a
                level on every one of them. h2 is correct on those and still
                correct on the homepage, where the last content heading is
                also an h2. Visual size is set by the classes, not the tag. */}
            <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">Explore</h2>
            <ul className="mt-4 flex flex-col gap-3 text-sm">
              {EXPLORE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-slate-500 transition hover:text-[rgb(var(--c-a-300))]">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">Account</h2>
            <ul className="mt-4 flex flex-col gap-3 text-sm">
              {isLoggedIn ? (
                <li>
                  <Link href="/dashboard" className="text-slate-500 transition hover:text-[rgb(var(--c-a-300))]">
                    Dashboard
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link href="/login" className="text-slate-500 transition hover:text-[rgb(var(--c-a-300))]">
                      Log in
                    </Link>
                  </li>
                  <li>
                    <Link href="/register" className="text-slate-500 transition hover:text-[rgb(var(--c-a-300))]">
                      Create account
                    </Link>
                  </li>
                </>
              )}
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-slate-500 transition hover:text-[rgb(var(--c-a-300))]">
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
