"use client";

import { AskAiButton } from "@/components/layout/AskAiButton";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useSession, signOut } from "next-auth/react";
import { DiscordIcon } from "@/components/ui/icons";
import { DISCORD_INVITE_URL } from "@/lib/discord";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { setFullscreenNavOpen } from "@/lib/overlayNav";

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
 *
 * ── Active state ────────────────────────────────────────────────────────
 * Classes/Pricing/Shop used to render identically regardless of which page
 * you were actually on, by omission rather than intent: reported directly
 * ("switching tabs, there is no visual indicator... they all look the
 * same"). Fixed with `usePathname()` plus the same solid-accent-fill
 * treatment the admin filter pills already use for "this one is selected"
 * elsewhere in the app, not a new one-off effect.
 */

const LINKS = [
  { label: "Classes", href: "/classes" },
  { label: "Pricing", href: "/pricing" },
  { label: "Shop", href: "/shop" },
];

export function MarketingNav() {
  const { data: session, status } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const reduced = useReducedMotion();
  const pathname = usePathname();

  const [lifted, setLifted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // `image` isn't on the session (see the avatar route's own comment), so
  // this is the client-side equivalent of TopBar's server-side DB fetch:
  // one small authenticated GET, only once actually signed in, cached in
  // local state for the rest of this mount. Was hardcoded null before,
  // which is why the homepage's own profile icon always showed the
  // name-initial fallback even for an account with a real photo.
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/account/avatar")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setImage(data.image);
      })
      .catch(() => {
        // Best-effort: the initial-letter fallback is a perfectly fine
        // result if this fetch fails for any reason, not worth surfacing.
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

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

  // Tells Atom (portaled separately, straight to document.body) to hide
  // its launcher while this is open — see lib/overlayNav.ts.
  useEffect(() => {
    setFullscreenNavOpen(menuOpen);
    return () => setFullscreenNavOpen(false);
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
    : { label: "Get started", href: "/register" };
  // Logged in: no separate "Account" pill any more — ProfileMenu's own
  // Settings item goes to the same /account, so it'd be a second link
  // pointing at the same place. Logged out: unchanged, "Log in".
  const secondary = isLoggedIn ? null : { label: "Log in", href: "/login" };

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
              width={40}
              height={40}
              className="h-10 w-10"
            />
            {/* The wordmark is set in the display face (font-serif resolves
                to --font-display, Baloo 2 as of this pass) so the brand and
                the composition are visibly one system rather than a logo
                dropped onto it. Bold, lowercase (via text-transform, not
                the underlying text, so "Bass Note Piano" stays correct for
                screen readers/SEO) — matching pianote.com's own actual
                wordmark treatment (studied directly), not the small label
                this replaces. Colored in the accent at the time; neutral
                again now under the "premium black and white" pass. */}
            <span className="hidden font-serif text-body font-bold lowercase tracking-[-0.01em] text-[rgb(var(--c-s-50))] md:inline">
              Bass Note Piano
            </span>
            {/* Phones show the logo alone (the link keeps its aria-label); the
                wordmark returns at md and up, i.e. iPad and desktop. */}
          </Link>

          {/* Classes/Pricing/Log in — real glass too, one tier down from the
              primary CTA below: `glass-surface-subtle` (Level 1, the same
              tier nav pills are documented for) rather than
              `glass-surface-elevated` (Level 3, reserved for the one most
              important element on screen — already spent on "Start
              learning"). Using elevated glass on all four would flatten
              that hierarchy back to "everything's equally important". */}
          <div className="hidden items-center gap-3 md:flex">
            {LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "tap flex h-9 items-center !rounded-full bg-[rgb(var(--c-s-50))] px-4 text-small font-medium text-slate-950 transition-colors duration-200"
                      : "tap glass-surface-subtle flex h-9 items-center !rounded-full px-4 text-small font-medium text-[rgb(var(--c-s-200))] transition-colors duration-200 hover:text-[rgb(var(--c-s-50))]"
                  }
                >
                  {link.label}
                </Link>
              );
            })}
            {secondary && (
              <Link
                href={secondary.href}
                className="tap glass-surface-subtle flex h-9 items-center !rounded-full px-4 text-small font-medium text-[rgb(var(--c-s-200))] transition-colors duration-200 hover:text-[rgb(var(--c-s-50))]"
              >
                {secondary.label}
              </Link>
            )}
            {/* Icon-only, same Level 1 glass as the pills above rather than
                a labeled pill — this is a single external link, not another
                in-app destination, so it reads as secondary chrome next to
                Classes/Pricing/Log in without competing with them. */}
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Join our Discord"
              className="tap glass-surface-subtle flex h-9 w-9 items-center justify-center !rounded-full text-[rgb(var(--c-s-200))] transition-colors duration-200 hover:text-[rgb(var(--c-s-50))]"
            >
              <DiscordIcon size={16} className="text-[#5865F2]" />
            </a>
            {/* Sits immediately next to the Dashboard button, by direct
                instruction — replaces the old plain "Account" text pill
                (ProfileMenu's own Settings item already goes to /account). */}
            {isLoggedIn && (
              <ProfileMenu
                name={session?.user?.name ?? null}
                username={null}
                email={session?.user?.email ?? null}
                image={image}
                triggerClassName="!h-9 !w-9"
              />
            )}
            {/* Real liquid glass here specifically — `glass-surface-elevated`
                (translucent, blurred, accent-tinted border — Instagram's
                purple/pink/orange now, signal green originally) instead of
                `.btn-primary`'s solid gradient fill. Scoped to just this one
                nav button; `.btn-primary` itself is untouched, so the Hero/
                FinalCTA/etc. CTAs elsewhere keep their existing solid look. */}
            <Link
              href={primary.href}
              className="btn glass-surface-elevated !h-10 !px-5 !text-small text-[rgb(var(--c-s-50))]"
            >
              {primary.label}
            </Link>
          </div>

          {/* Ask AI lives in the bar itself, never in the mobile menu list, so it is
              reachable at every width without opening anything. */}
          <div className="ml-auto flex items-center gap-2 md:ml-3">
            {/* Phones (md and up has these in the row above). Signed out: Log in
                and Get started, so how to get in is visible without opening the
                menu. Signed in: Dashboard and the profile button (Sign out lives
                inside it). Get started / Dashboard appear from 360px up; on the
                narrowest phones the menu still has them. */}
            <div className="flex items-center gap-2 md:hidden">
              {status === "loading" ? null : isLoggedIn ? (
                <>
                  <Link
                    href={primary.href}
                    className="tap hidden h-9 items-center rounded-full bg-neu-base px-4 text-small font-semibold text-[rgb(var(--c-s-50))] shadow-raised-low transition active:shadow-pressed-low min-[360px]:flex"
                  >
                    {primary.label}
                  </Link>
                  <ProfileMenu
                    name={session?.user?.name ?? null}
                    username={null}
                    email={session?.user?.email ?? null}
                    image={image}
                    triggerClassName="!h-9 !w-9"
                  />
                </>
              ) : (
                <>
                  {secondary && (
                    <Link
                      href={secondary.href}
                      className="tap flex h-9 items-center rounded-full px-3 text-small font-semibold text-[rgb(var(--c-s-50))] transition hover:opacity-80"
                    >
                      {secondary.label}
                    </Link>
                  )}
                  <Link
                    href={primary.href}
                    className="tap hidden h-9 items-center rounded-full bg-[rgb(var(--signal))] px-4 text-small font-semibold text-slate-950 shadow-raised-low transition active:shadow-pressed-low min-[360px]:flex"
                  >
                    {primary.label}
                  </Link>
                </>
              )}
            </div>
            <AskAiButton compactOnPhones />
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
          </div>
        </nav>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }}
            transition={{ duration: reduced ? 0.15 : 0.4, ease: [0.16, 1, 0.3, 1] }}
            // overflow-y-auto/overscroll-contain: this panel's own link list
            // (Classes/Pricing/Shop, +Profile/Settings/Log out once signed
            // in, +Discord, +the Dashboard/Start-learning button) is taller
            // than the visible area on plenty of real phones, especially
            // signed in — and the effect below locks `document.body` itself
            // to `overflow: hidden` the whole time this is open, so without
            // its own scroll the overflow isn't just visually cut off, it's
            // completely unreachable: reported live as the bottom button
            // being cut off by Safari's own toolbar with no way to get to
            // it. Same `overscroll-contain` convention `<main>` already uses
            // in `(dashboard)/layout.tsx`, so this panel's own scroll can't
            // rubber-band chain up into the (already non-scrolling) body.
            className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[rgb(var(--c-s-950)/0.97)] backdrop-blur-2xl md:hidden"
          >
            <div className="flex h-20 items-center justify-between px-6">
              <span className="font-serif text-body font-bold lowercase text-[rgb(var(--c-s-50))]">
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

            {/* pb-10 plus the safe-area env(), not just pb-10 alone: the
                Dashboard/Start-learning button is the last thing in this
                list, so it's the one that would otherwise land flush
                against the home indicator (or, pre-scroll-fix above, get
                clipped by it entirely) on a notched phone. */}
            <div className="flex flex-col px-6 pt-8 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
              {[...LINKS, ...(secondary ? [secondary] : [])].map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={`display-3 border-b border-[rgb(var(--c-s-50)/0.08)] py-6 ${
                      isActive ? "text-[rgb(var(--c-s-50))]" : ""
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
              {/* No dropdown on a full-screen sheet — it's already the
                  expanded state, so Profile/Settings/Log out are just flat
                  rows here instead of nesting ProfileMenu inside it. */}
              {isLoggedIn && (
                <>
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="display-3 border-b border-[rgb(var(--c-s-50)/0.08)] py-6"
                  >
                    Profile
                  </Link>
                  <Link
                    href="/account"
                    onClick={() => setMenuOpen(false)}
                    className="display-3 border-b border-[rgb(var(--c-s-50)/0.08)] py-6"
                  >
                    Settings
                  </Link>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="display-3 border-b border-[rgb(var(--c-s-50)/0.08)] py-6 text-left text-[rgb(var(--c-s-300))]"
                  >
                    Log out
                  </button>
                </>
              )}
              <a
                href={DISCORD_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="display-3 flex items-center gap-3 border-b border-[rgb(var(--c-s-50)/0.08)] py-6"
              >
                <DiscordIcon size={28} className="text-[#5865F2]" />
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
