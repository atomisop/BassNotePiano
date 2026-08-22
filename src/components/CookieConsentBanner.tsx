"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { readConsent, writeConsent } from "@/lib/cookieConsent";

/**
 * Cookie consent banner — mounted once in `Providers`, so it's present on
 * every route (marketing, auth, and the authenticated app alike).
 *
 * Honest about what's actually in this codebase: the only cookie this app
 * sets today is NextAuth's own session cookie, which is strictly necessary
 * (you can't stay signed in without it) and — same as every major consent
 * framework's own rule — never asks permission for that. "Analytics" is
 * offered as a real, saveable choice even though nothing here fires an
 * analytics event yet (checked before writing this: no gtag/GA/posthog/
 * mixpanel/hotjar anywhere in `src/`). Anything added later is expected to
 * call `hasConsent("analytics")` from `@/lib/cookieConsent` before it runs,
 * so the mechanism is real ahead of there being a category to gate.
 *
 * No dismiss-without-deciding control (no bare ✕): three direct choices
 * (Accept all / Reject non-essential / Customize → Save) is a complete set
 * of outcomes on its own, and adding a fourth "close" affordance would just
 * make "I didn't actually choose anything" ambiguous with "I chose reject".
 *
 * `mounted` gate: `readConsent()` touches `localStorage`, which doesn't
 * exist during server render — rendering `null` until after mount avoids a
 * hydration mismatch, same pattern the theme boot script exists to avoid
 * for `data-theme`.
 */
export function CookieConsentBanner() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [analyticsChoice, setAnalyticsChoice] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    setMounted(true);
    setVisible(readConsent() === null);
  }, []);

  function decide(analytics: boolean) {
    writeConsent({ analytics });
    setVisible(false);
  }

  if (!mounted || !visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        role="region"
        aria-label="Cookie preferences"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
        transition={{ duration: reduced ? 0.15 : 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="glass-surface fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-md p-5 sm:inset-x-auto sm:right-4 sm:left-auto"
      >
        <p className="text-sm font-medium text-[rgb(var(--c-s-50))]">This site uses cookies</p>
        <p className="mt-1.5 text-sm leading-relaxed text-[rgb(var(--c-s-300))]">
          A necessary cookie keeps you signed in — that one&apos;s never optional. Everything else
          is your choice.
        </p>

        {customizing && (
          <div className="mt-4 space-y-2.5 border-t border-[rgb(var(--c-s-50)/0.08)] pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-[rgb(var(--c-s-100))]">Necessary</p>
                <p className="text-xs text-[rgb(var(--c-s-400))]">Keeps you signed in. Always on.</p>
              </div>
              <span className="chip-neutral rounded-full px-3 py-1 text-xs text-[rgb(var(--c-s-400))]">
                Always on
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-[rgb(var(--c-s-100))]">Analytics</p>
                <p className="text-xs text-[rgb(var(--c-s-400))]">
                  Not in use yet. Your choice is saved either way.
                </p>
              </div>
              <Switch
                checked={analyticsChoice}
                onCheckedChange={setAnalyticsChoice}
                aria-label="Allow analytics cookies"
              />
            </div>
          </div>
        )}

        {/* `size="sm"` for the compact padding/text this banner wants, plus an
            explicit `min-h-11` (44px) override — `sm`'s own height (36px)
            is fine for dense in-app UI but falls short of the 44px touch
            target minimum, which matters more here than almost anywhere
            else in the app: this is the first interactive thing many
            visitors touch, often on the smallest screens. */}
        <div className="mt-4 flex flex-wrap gap-2">
          {customizing ? (
            <Button size="sm" className="min-h-11" onClick={() => decide(analyticsChoice)}>
              Save preferences
            </Button>
          ) : (
            <>
              <Button size="sm" className="min-h-11" onClick={() => decide(true)}>
                Accept all
              </Button>
              <Button size="sm" variant="outline" className="min-h-11" onClick={() => decide(false)}>
                Reject non-essential
              </Button>
              <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setCustomizing(true)}>
                Customize
              </Button>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
