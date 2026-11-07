"use client";

import { BrandLogo } from "@/components/ui/BrandLogo";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { DiscordIcon } from "@/components/ui/icons";
import { DISCORD_INVITE_URL } from "@/lib/discord";

// Every link here maps to a route that actually exists on this site,
// no invented Docs/Blog/Careers/Status columns, no email-signup box with
// nowhere real for it to go. "Account" swaps to a single Dashboard link
// once signed in, same logic MarketingNav already uses.
const EXPLORE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/classes", label: "Live classes" },
  { href: "/pricing", label: "Pricing" },
  { href: "/shop", label: "Shop" },
];

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms & refund policy" },
  { href: "/privacy", label: "Privacy policy" },
];

export function SiteFooter() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    // Plain <footer>, not GradientFooter: that component's rising glow band
    // (fixed to the viewport bottom, blooming as the footer scrolls into
    // view) is gone by direct instruction ("the glowing thing that pops out
    // at the bottom"). It had already been dialed down once before
    // (minReveal={0}, see git history) but stayed visible at the very
    // bottom of every page regardless. GradientFooter.tsx had no other
    // caller, so it's deleted rather than kept as dead code.
    <footer className="relative border-t border-ink/5">
      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-16">
        <div className="grid grid-cols-1 gap-10 pb-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            {/* Same wordmark treatment as MarketingNav's own (bold, lowercase).
                This was still the pre-Pianote-pass uppercase/wide-tracked/
                partial-color version, the one spot that got missed when the
                nav's was updated. Fully accent-colored at the time; neutral
                again now under the "premium black and white" pass. */}
            <Link href="/" className="flex items-center gap-2">
              <BrandLogo height={22} className="text-slate-50" />
              <span className="font-serif text-small font-bold lowercase tracking-tight text-slate-50">
                Bass Note Piano
              </span>
            </Link>
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="tap mt-4 inline-flex items-center gap-2 text-small text-slate-500 transition hover:text-slate-50"
            >
              <DiscordIcon size={18} className="text-discord" />
              Join our Discord
            </a>
          </div>

          <div>
            {/* h2, not h3: this footer renders on pages whose only other
                heading is the h1 (/classes, /terms), so an h3 here skipped a
                level on every one of them. h2 is correct on those and still
                correct on the homepage, where the last content heading is
                also an h2. Visual size is set by the classes, not the tag. */}
            <h2 className="text-small font-medium uppercase tracking-caps text-slate-50/80">Explore</h2>
            <ul className="mt-4 flex flex-col gap-3 text-small">
              {EXPLORE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="tap inline-flex items-center text-slate-500 transition hover:text-slate-50">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-small font-medium uppercase tracking-caps text-slate-50/80">Account</h2>
            <ul className="mt-4 flex flex-col gap-3 text-small">
              {isLoggedIn ? (
                <li>
                  <Link href="/dashboard" className="tap inline-flex items-center text-slate-500 transition hover:text-slate-50">
                    Dashboard
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link href="/login" className="tap inline-flex items-center text-slate-500 transition hover:text-slate-50">
                      Log in
                    </Link>
                  </li>
                  <li>
                    <Link href="/register" className="tap inline-flex items-center text-slate-500 transition hover:text-slate-50">
                      Create account
                    </Link>
                  </li>
                </>
              )}
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="tap inline-flex items-center text-slate-500 transition hover:text-slate-50">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* slate-600 (not used here) is documented in marketing.css as
            "non-text, always" at 4.4:1, real body text needs the 4.5:1
            slate-500 sits at instead. Caught by an axe-core pass; this line
            was the one real text-contrast failure on the marketing site. */}
        <div className="border-t border-ink/5 py-6 text-center text-small text-slate-500">
          © {new Date().getFullYear()} Bass Note Piano.
        </div>
      </div>
    </footer>
  );
}
