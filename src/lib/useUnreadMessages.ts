"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchUnreadMessageCountAction } from "@/app/(dashboard)/notification-actions";
import { onChange } from "@/lib/liveEvents";

const POLL_INTERVAL_MS = 30_000;

/** Unread message count, seeded from the server and kept fresh (30s poll, route changes, live "messages" events). */
export function useUnreadMessages(initial: number): number {
  const pathname = usePathname();
  const [unread, setUnread] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const count = await fetchUnreadMessageCountAction();
        if (!cancelled) setUnread(count);
      } catch (err) {
        console.error("Unread message count refresh failed (non-blocking, will retry):", err);
      }
    }
    refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_INTERVAL_MS);
    const stop = onChange("messages", refresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      stop();
    };
  }, [pathname]);

  return unread;
}
