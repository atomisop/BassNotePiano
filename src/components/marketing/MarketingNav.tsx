"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useSession } from "next-auth/react";
import { DiscordIcon } from "@/components/ui/icons";
import { DISCORD_INVITE_URL } from "@/lib/discord";

/**
 * The homepage header.
 *
 * ── Why this replaces the capsule ───────────────────────────────────────
 * The previous header was shadcnblocks' Navbar1 hung inside a floating
 * `glass-pill`: a rounded, bordered, blurred lozenge with a mega-menu
 * dropdown. Three things were wrong with it here.
 *
 * It competes. A capsule is an object — it has an edge, a fill and a shadow,
 * so it reads as a *thing sitting on* the photograph rather than as chrome.
 * On a page whose entire premise is one uninterrupted cinematic frame, the
 * header should be the least present element on screen, not the most defined.
 *
 * It mis-signals. A mega-menu with descriptions implies a large product with
 * many destinations. This site has four public routes. The dropdown made two
 * of them look like a category.
 *
 * It leaks. Radix's NavigationMenu portals its viewport to document.body,
 * which is outside `[data-surface="marketing"]`, so the dropdown rendered
 * with the app's luxury ramp — the white accent — no matter what the page
 * around it did. (It also emitted a forwardRef warning on every render.)
 * Everything here is inline, so the scope holds.
 *
 * ── Behaviour ───────────────────────────────────────────────────────────
 * Transparent and borderless over the hero, because the hero's own shade
 * already carries it. Past the first viewport it earns a hairline and a
 * wash, which is the point at which content starts passing underneath and
 * the bar needs to separate from it.
 */

const LINKS = [
  { label: "Classes", href: "/classes" },
  { label: "Pricing", href: "/pricing" },
  { label: "Shop", href: "/shop" },
];

export function MarketingNav() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const reduced = useReducedMotion();

  const [lifted, setLifted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Passive read of the existing window scroll. Deliberately not a second
  // scroll *engine* — Lenis still drives the position, this only observes it.
  //
  // The threshold is 8px, not "past the hero". The hero's headline sits low
  // in the frame with empty space above it, so at rest there is nothing for
  // the bar to separate from — but that headline starts climbing into the bar
  // on the very first scroll, and a transparent bar over 8rem serif is
  // illegible for both. So: bare while the page is at rest, backed the moment
  // anything moves.
  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A full-screen panel must not leave the page scrollable behind it.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  // Escape closes, because a full-screen overlay that only has a visual
  // close button is a keyboard trap.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const primary = isLoggedIn
    ? { label: "Dashboard", href: "/dashboard" }
    : { label: "Start learning", href: "/register" };
  const secondary = isLoggedIn
    ? { label: "Account", href: "/account" }
    : { label: "Log in", href: "/login" };

  return (
    <>
      <header
        className={[
          "fixed inset-x-0 top-0 z-40 transition-colors duration-500",
          lifted ? "border-b border-[rgb(var(--c-s-50)/0.1)] bg-[rgb(var(--c-s-950)/0.8)] backdrop-blur-xl" : "border-b border-transparent",
        ].join(" ")}
      >
        {/* HOMEPAGE REPLACEMENT: header-2's own "compact state on scroll" is
            a real height/padding reduction, not just a background fade —
            adapted here as h-20/md:h-24 easing down to h-16/md:h-20 once
            `lifted`, on the same 500ms transition the background already
            used. */}
        <nav
          className={[
            "mx-auto flex w-full max-w-[90rem] items-center justify-between px-6 transition-[height,padding] duration-500 md:px-16",
            lifted ? "h-16 md:h-20" : "h-20 md:h-24",
          ].join(" ")}
        >
          <Link href="/" className="flex items-center gap-3" aria-label="Bass Note Piano, home">
            <Image
              src="/logo-mark.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-[6px]"
            />
            {/* The wordmark is set in the display face at label scale — the
                same serif as the headline, so the brand and the composition
                are visibly one system rather than a logo dropped onto it. */}
            <span className="font-serif text-[15px] tracking-[-0.01em] text-[rgb(var(--c-s-50))]">
              Bass Note Piano
            </span>
          </Link>

          {/* Classes/Pricing/Log in — real glass too, one tier down from the
              primary CTA below: `glass-surface-subtle` (Level 1, the same
              tier nav pills are documented for) rather than
              `glass-surface-elevated` (Level 3, reserved for the one most
              important element on screen — already spent on "Start
              learning"). Using elevated glass on all four would flatten
              that hierarchy back to "everything's equally important". */}
          <div className="hidden items-center gap-3 md:flex">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="glass-surface-subtle flex h-9 items-center !rounded-full px-4 text-[13px] font-medium text-[rgb(var(--c-s-200))] transition-colors duration-200 hover:text-[rgb(var(--c-s-50))]"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={secondary.href}
              className="glass-surface-subtle flex h-9 items-center !rounded-full px-4 text-[13px] font-medium text-[rgb(var(--c-s-200))] transition-colors duration-200 hover:text-[rgb(var(--c-s-50))]"
            >
              {secondary.label}
            </Link>
            {/* Icon-only, same Level 1 glass as the pills above rather than
                a labeled pill — this is a single external link, not another
                in-app destination, so it reads as secondary chrome next to
                Classes/Pricing/Log in without competing with them. */}
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Join our Discord"
              className="glass-surface-subtle flex h-9 w-9 items-center justify-center !rounded-full text-[rgb(var(--c-s-200))] transition-colors duration-200 hover:text-[rgb(var(--c-s-50))]"
            >
              <DiscordIcon size={16} />
            </a>
            {/* Real liquid glass here specifically — `glass-surface-elevated`
                (translucent, blurred, signal-green-tinted border) instead of
                `.btn-primary`'s solid gradient fill. Scoped to just this one
                nav button; `.btn-primary` itself is untouched, so the Hero/
                FinalCTA/etc. CTAs elsewhere keep their existing solid look. */}
            <Link
              href={primary.href}
              className="btn glass-surface-elevated !h-10 !px-5 !text-[13px] text-[rgb(var(--c-s-50))]"
            >
              {primary.label}
            </Link>
          </div>

          {/* 44px minimum target, which the previous icon button did not meet. */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="-mr-3 flex h-11 w-11 items-center justify-center md:hidden"
          >
            <span className="flex flex-col gap-[5px]">
              <span className="block h-px w-5 bg-[rgb(var(--c-s-50))]" />
              <span className="block h-px w-5 bg-[rgb(var(--c-s-50))]" />
            </span>
          </button>
        </nav>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }}
            transition={{ duration: reduced ? 0.15 : 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 bg-[rgb(var(--c-s-950)/0.97)] backdrop-blur-2xl md:hidden"
          >
            <div className="flex h-20 items-center justify-between px-6">
              <span className="font-serif text-[15px] text-[rgb(var(--c-s-50))]">
                Bass Note Piano
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="-mr-3 flex h-11 w-11 items-center justify-center text-[rgb(var(--c-s-50))]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path d="M5 5l14 14M19 5L5 19" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col px-6 pt-8">
              {[...LINKS, secondary].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="display-3 border-b border-[rgb(var(--c-s-50)/0.08)] py-6"
                >
                  {link.label}
                </Link>
              ))}
              <a
                href={DISCORD_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="display-3 flex items-center gap-3 border-b border-[rgb(var(--c-s-50)/0.08)] py-6"
              >
                <DiscordIcon size={28} />
                Discord
              </a>
              <Link
                href={primary.href}
                onClick={() => setMenuOpen(false)}
                className="btn btn-primary mt-10 w-full"
              >
                {primary.label}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
