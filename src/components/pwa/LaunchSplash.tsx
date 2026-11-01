"use client";

import { useEffect } from "react";
import { SPLASH_EXIT_MS, SPLASH_MIN_MS } from "@/lib/launchSplash";

/**
 * Lets the opening animation (`#bnp-splash`, drawn by CSS from the first frame; see lib/launchSplash.ts) go once the app is ready and the
 * animation has had its time. If this never runs, the CSS hides the layer by itself after a few seconds, so the app can never stay covered.
 */
export function LaunchSplash() {
  useEffect(() => {
    const root = document.documentElement;
    const layer = document.getElementById("bnp-splash");
    if (!layer || !root.hasAttribute("data-splash")) return;
    // performance.now() counts from the start of the page load, so a slow start does not wait any longer than it already did.
    const wait = Math.max(0, SPLASH_MIN_MS - performance.now());
    let removeTimer: number | undefined;
    const leaveTimer = window.setTimeout(() => {
      layer.classList.add("is-leaving");
      removeTimer = window.setTimeout(() => root.removeAttribute("data-splash"), SPLASH_EXIT_MS + 40);
    }, wait);
    return () => {
      window.clearTimeout(leaveTimer);
      if (removeTimer) window.clearTimeout(removeTimer);
    };
  }, []);
  return null;
}
