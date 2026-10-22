"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { FADE, SPRING } from "@/lib/motionTokens";
import { detectPlatform, shouldPromptAddToHome } from "@/lib/addToHome";
import { AddToHomeSteps, isStandalone } from "./AddToHomeSteps";

const SEEN_KEY = "bnp-add-to-home-seen";
const DELAY_MS = 2500;

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return false;
  }
}
function markSeen(value: string) {
  try {
    localStorage.setItem(SEEN_KEY, value);
  } catch {
    /* private mode: it may show again next visit, which is fine */
  }
}

/**
 * Asks once per device (not per account) to put the site on the Home Screen so it feels like a phone app, with the steps right there.
 * Only on phones and tablets, never when already running from the Home Screen, and never over the first-visit tour or the "what's new"
 * card (`suppressed`): it simply waits for a later visit. If the person closes it without doing it, a short note says the steps live in
 * Settings > Tutorials.
 */
export function AddToHomePrompt({ suppressed }: { suppressed: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(false);

  // Chrome on Android offers a one-tap install through this event, but only early on: keep it for the steps card.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__bnpInstallPrompt = e as never;
      window.dispatchEvent(new Event("bnp:install-ready"));
    };
    const onInstalled = () => {
      markSeen("installed");
      setOpen(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (suppressed) return;
    const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
    if (!shouldPromptAddToHome({ platform, standalone: isStandalone(), seen: readSeen() })) return;
    const show = () => {
      markSeen("shown"); // once per device: marked the moment it appears
      setOpen(true);
    };
    // Only while the tab is on screen: if it is in the background when the delay ends, wait until it comes forward.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisible);
      show();
    };
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible") show();
      else document.addEventListener("visibilitychange", onVisible);
    }, DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [suppressed]);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(false), 9000);
    return () => window.clearTimeout(timer);
  }, [note]);

  const later = useCallback(() => {
    setOpen(false);
    setNote(true);
  }, []);
  const done = useCallback(() => {
    markSeen("done");
    setOpen(false);
  }, []);
  const dialogRef = useDialogFocus<HTMLDivElement>(open, later);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center" initial="hidden" animate="visible" exit="hidden">
            <motion.div variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }} transition={FADE} className="absolute inset-0 bg-scrim/60" onClick={later} />
            <motion.div
              ref={dialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="a2hs-title"
              variants={{ hidden: { opacity: 0, y: 24, scale: 0.96 }, visible: { opacity: 1, y: 0, scale: 1, transition: SPRING.snappy } }}
              className="glass-surface-modal relative max-h-[88dvh] w-full max-w-sm overflow-y-auto overscroll-contain p-6"
            >
              <button type="button" onClick={later} aria-label="Close" className="tap absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:text-slate-100">
                <X className="h-5 w-5" aria-hidden />
              </button>
              <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Make it an app</p>
              <h2 id="a2hs-title" className="mt-1.5 text-body font-semibold text-slate-50">
                Add Bass Note Piano to your Home Screen
              </h2>
              <p className="mt-2 text-small text-slate-400">It opens full screen with its own icon, just like an app from the store, and class reminders work better. It takes about 20 seconds.</p>
              <div className="mt-4">
                <AddToHomeSteps onInstalled={done} />
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={later} className="tap text-small text-slate-400 underline underline-offset-4 hover:text-slate-200">
                  Maybe later
                </button>
                <button type="button" onClick={done} className={buttonVariants({ variant: "primary", size: "sm", className: "text-black" })}>
                  I added it
                </button>
              </div>
              <p className="mt-3 text-small text-slate-500">You can find these steps again any time in Settings, under Tutorials.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {note && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-[55] flex justify-center px-5">
          <div className="flex max-w-[26rem] items-center gap-3 rounded-2xl border border-[rgb(var(--c-s-50)/0.1)] bg-white/95 px-4 py-3 text-small text-slate-100 shadow-[0_8px_28px_rgb(0_0_0/0.2)] dark:bg-[rgb(var(--c-s-900)/0.97)]">
            <span>No problem. The steps are in Settings, under Tutorials, whenever you want them.</span>
            <Link href="/account?tab=tutorials" onClick={() => setNote(false)} className="tap shrink-0 font-medium underline underline-offset-4">
              Open
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
