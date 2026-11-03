"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// The pages a person moves between most, fetched in full (not just their loading skeleton) so a tap opens them at once.
const STUDENT_PAGES = ["/dashboard", "/roadmap", "/practice", "/lessons", "/friends", "/leaderboard", "/account", "/billing/plans"];
const ADMIN_PAGES = ["/admin", "/admin/payments", "/admin/users", "/admin/today", "/admin/support", "/admin/data", "/account"];

// AutoRefresh re-runs the open page every 90 seconds, which empties the router's cache, so the pages are fetched again just after.
const AGAIN_MS = 100_000;
const GAP_MS = 350;

type Connection = { saveData?: boolean; effectiveType?: string };

/**
 * Fetches every main page in the background, one at a time, a moment after the app opens and again after each refresh, so a button or
 * dock tap shows its screen immediately instead of waiting on the server. Production only (the router does not prefetch in development),
 * paused for a hidden tab, and skipped on data saver or a very slow connection.
 */
export function PreloadPages({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: Connection }).connection;
    if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "")) return;
    const pages = (isAdmin ? ADMIN_PAGES : STUDENT_PAGES).filter((href) => href !== pathname);
    // "full" asks for the whole page's data; the router's own typing only lists it under an internal enum.
    const options = { kind: "full" } as unknown as Parameters<typeof router.prefetch>[1];
    const timers: number[] = [];
    const run = () => {
      if (document.visibilityState !== "visible") return;
      pages.forEach((href, i) => timers.push(window.setTimeout(() => router.prefetch(href, options), i * GAP_MS)));
    };
    timers.push(window.setTimeout(run, 2_500));
    const again = window.setInterval(run, AGAIN_MS);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.clearInterval(again);
    };
  }, [router, pathname, isAdmin]);

  return null;
}
