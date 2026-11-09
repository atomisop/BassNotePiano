"use client";

import { useEffect } from "react";

/** How many orange buttons may stand out in one card, row or toolbar of an admin screen. */
const KEEP = 2;

/**
 * Admin screens keep only their first two orange (main action) buttons filled; every other one is marked `data-quiet` and drawn as plain gray
 * text (see globals.css). Re-checks when the page changes, so lists that load later are covered too.
 */
export function AdminQuietButtons() {
  useEffect(() => {
    const root = document.querySelector("[data-admin-page]");
    if (!root) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const mains = root.querySelectorAll<HTMLElement>(".liquid-signal:is(button, a):not([data-keep-chrome]):not([class*='bg-red-'])");
      const counts = new Map<Element, number>();
      mains.forEach((el) => {
        const group = el.closest("li, article, tr, [data-card]") ?? root;
        const n = counts.get(group) ?? 0;
        counts.set(group, n + 1);
        if (n < KEEP) el.removeAttribute("data-quiet");
        else el.setAttribute("data-quiet", "");
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    const obs = new MutationObserver(schedule);
    obs.observe(root, { childList: true, subtree: true });
    return () => {
      obs.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
