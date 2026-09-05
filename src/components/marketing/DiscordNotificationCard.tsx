"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DiscordIcon, XIcon } from "@/components/ui/icons";
import { DISCORD_INVITE_URL } from "@/lib/discord";

const DISMISS_KEY = "bnp-discord-card-dismissed";

/**
 * A small, dismissible promo for the Discord server, mounted once in the
 * marketing layout so it's present on every public page.
 *
 * Positioning is what it is because of two other fixed elements that
 * already live in the bottom-right corner (ScrollToTopButton, the Atom
 * widget) plus CookieConsentBanner, which also claims that corner on sm+
 * screens (`sm:right-4`) and the full bottom strip on mobile
 * (`inset-x-4 bottom-4`). Rather than guess at both banners' heights to
 * stack them, this sits somewhere that structurally can't collide either
 * way: below the navbar on mobile, bottom-left (the opposite corner from
 * the cookie banner) on sm+.
 *
 * `mounted` gate + localStorage persistence: same reasoning as
 * CookieConsentBanner right down the mount-gate-to-avoid-hydration-mismatch
 * pattern, just a plain dismissed flag instead of a real consent choice.
 *
 * The card itself is a plain, non-interactive `motion.div` with two
 * independent sibling controls (the dismiss button and the "Join now"
 * link), not a link wrapping a dismiss button, that nested-interactive
 * shape is exactly what the accessibility pass on AssistantWidget fixed.
 */
export function DiscordNotificationCard() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    setMounted(true);
    setVisible(localStorage.getItem(DISMISS_KEY) !== "1");
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!mounted || !visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        role="region"
        aria-label="Join our Discord"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: -16 }}
        transition={{ duration: reduced ? 0.15 : 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="glass-surface fixed inset-x-4 top-20 z-[60] mx-auto flex max-w-xs items-center gap-2.5 py-2.5 pl-3 pr-9 sm:inset-x-auto sm:left-4 sm:right-auto sm:top-auto sm:bottom-4"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--c-s-50)/0.15)] text-[rgb(var(--c-s-50))]">
          <DiscordIcon size={16} className="text-[#5865F2]" />
        </span>
        <a
          href={DISCORD_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-sm font-medium text-slate-50 hover:text-[rgb(var(--c-s-50))]"
        >
          Join our Discord →
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-200"
        >
          <XIcon size={12} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
