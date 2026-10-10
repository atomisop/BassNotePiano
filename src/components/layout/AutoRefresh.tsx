"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

// How often the signed-in pages quietly re-fetch their own data while the tab
// is open and in view.
const INTERVAL_MS = 30_000;
// Coming back to the tab or reconnecting refreshes at once, unless one just ran.
const MIN_GAP_MS = 8_000;

// Screens that must not be refreshed under the person: Messages and the top-bar
// panels already poll for themselves; a lesson (video, quiz, notes) and the
// profile and the buy-a-plan screens would be interrupted for no gain. Settings and
// the payment history are refreshed too (a field being typed in is never refreshed).
const SKIP_PREFIXES = ["/messages", "/scales", "/profile", "/billing/plans", "/billing/lessons"];

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

/**
 * Keeps every signed-in page current without a manual reload: it re-runs the
 * page's server data fetch (`router.refresh()`) every 30 seconds while the tab
 * is visible and online, and straight away when you return to the tab or the
 * connection comes back. Client state (selected day, open tabs, scroll) is
 * kept; only the server data underneath is replaced. It holds off while you
 * are typing in a field, and on the screens listed above.
 */
export function AutoRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const lastRun = useRef(0);
  const pendingRef = useRef(false);
  pendingRef.current = isPending;

  useEffect(() => {
    if (SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return;

    function run(force = false) {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (pendingRef.current || isTyping()) return;
      const since = Date.now() - lastRun.current;
      if (since < (force ? MIN_GAP_MS : INTERVAL_MS - 1_000)) return;
      lastRun.current = Date.now();
      startTransition(() => router.refresh());
    }

    lastRun.current = Date.now();
    const timer = window.setInterval(() => run(), INTERVAL_MS);
    const onVisible = () => run(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [pathname, router]);

  return null;
}
