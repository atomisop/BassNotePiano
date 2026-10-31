"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { MeStatus } from "@/lib/meStatus";
import { onChange } from "@/lib/liveEvents";

const Ctx = createContext<MeStatus | null>(null);

/** The live status of the signed-in person (see src/lib/meStatus.ts). Null outside the signed-in app. */
export function useMeStatus(): MeStatus | null {
  return useContext(Ctx);
}

const POLL_MS = 60_000;
/**
 * Keeps what several parts of the screen show about the signed-in person current: it is fetched again every minute, when
 * the tab comes back into view, whenever they go to another page, and right away when any part of the app announces a
 * change (window event "bnp:status-changed"). It covers every screen, including the ones AutoRefresh leaves alone, which
 * is why the badge and the banners never lag behind.
 */
export function MeStatusProvider({ initial, children }: { initial: MeStatus; children: ReactNode }) {
  const [status, setStatus] = useState<MeStatus>(initial);
  const pathname = usePathname();

  // Fresh server data (a navigation or router.refresh) wins over what was fetched before it.
  useEffect(() => setStatus(initial), [initial]);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/me/status", { cache: "no-store", credentials: "same-origin" });
        if (res.ok && alive) setStatus((await res.json()) as MeStatus);
      } catch {
        // Offline or a hiccup: keep showing the last known values.
      }
    }
    // A background tab has nothing to show, so it does not ask; it catches up the moment it is shown again (below).
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    // Reading a message announces "messages": the unread badge (now part of this status) looks again.
    const stopMessages = onChange("messages", () => void load());
    const onChanged = () => void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("bnp:status-changed", onChanged);
    document.addEventListener("visibilitychange", onVisible);
    void load();
    return () => {
      alive = false;
      clearInterval(timer);
      stopMessages();
      window.removeEventListener("bnp:status-changed", onChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // A new page is a reason to look again.
  }, [pathname]);

  return <Ctx.Provider value={status}>{children}</Ctx.Provider>;
}
