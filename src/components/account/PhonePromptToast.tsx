"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Phone, X } from "lucide-react";

const SEEN_KEY = "bnp-phone-prompt-shown";

/**
 * A short popup asking someone with no verified phone number to add one. It appears once per sign-in
 * (sessionStorage, so a new session asks again until they do), a bar on its bottom edge runs out over
 * `seconds`, and then it closes by itself. Nothing is blocked: the same step is always in
 * Settings → Account.
 */
export function PhonePromptToast({ seconds }: { seconds: number }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // A beat after the page settles, so it does not land on top of the page loading in. Whether it was already
    // shown this session is decided when it is about to appear, not before the wait: an effect that runs twice
    // (React does that in development) must not use up the one showing.
    const show = setTimeout(() => {
      try {
        if (window.sessionStorage.getItem(SEEN_KEY)) return;
        window.sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        // Storage can be blocked; showing it is still fine.
      }
      setOpen(true);
    }, 1200);
    return () => clearTimeout(show);
  }, []);

  // The bar drains by CSS alone, so it never depends on frames being painted; this only closes the popup on time.
  useEffect(() => {
    if (!open) return;
    const close = setTimeout(() => setOpen(false), seconds * 1000);
    return () => clearTimeout(close);
  }, [open, seconds]);

  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-3 top-[4.75rem] z-[46] w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl bg-neu-base shadow-raised-high md:right-8"
    >
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neu-base text-signal shadow-pressed-low">
          <Phone className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-slate-100">Add your phone number</p>
          <p className="mt-0.5 text-small text-slate-400">Confirm it with a 6-digit text. It takes under a minute.</p>
          <div className="mt-3 flex gap-2">
            <Link
              href="/account?tab=account#phone"
              onClick={() => setOpen(false)}
              className="tap inline-flex items-center rounded-lg bg-signal px-3 py-1.5 text-small font-semibold text-slate-950 shadow-raised-low"
            >
              Add phone
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="tap rounded-lg bg-neu-base px-3 py-1.5 text-small font-medium text-slate-300 shadow-raised-low active:shadow-pressed-low"
            >
              Not now
            </button>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Dismiss" className="tap -mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-slate-200">
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* The timer: drains from full to empty over the popup's lifetime. */}
      <div className="h-1 w-full bg-[rgb(var(--signal)/0.18)]" aria-hidden>
        <style>{"@keyframes bnp-phone-prompt-drain{from{width:100%}to{width:0%}}"}</style>
        <div className="h-full bg-signal" style={{ animation: `bnp-phone-prompt-drain ${seconds}s linear forwards` }} />
      </div>
    </div>
  );
}
