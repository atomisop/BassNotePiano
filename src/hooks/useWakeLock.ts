"use client";

import { useEffect, useState } from "react";

/**
 * Keeps the screen on while `active`, so a phone does not lock mid-practice and
 * stop the timer. Re-acquires after the tab comes back into view (the browser
 * drops the lock whenever the page is hidden). `supported` is false where the
 * browser has no Screen Wake Lock, so the page can say to keep the screen on.
 */
export function useWakeLock(active: boolean): { supported: boolean; held: boolean } {
  const [supported, setSupported] = useState(true);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      setSupported(false);
      return;
    }
    if (!active) {
      setHeld(false);
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    async function acquire() {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
        setHeld(true);
        next.addEventListener("release", () => {
          if (sentinel === next) setHeld(false);
        });
      } catch {
        // Refused (battery saver, no permission): the page falls back to asking the student to keep the screen on.
        setHeld(false);
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") void acquire();
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
      setHeld(false);
    };
  }, [active]);

  return { supported, held };
}
