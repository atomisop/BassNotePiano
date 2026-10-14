"use client";

import { useEffect } from "react";
import { announceChange, type LiveKind } from "@/lib/liveEvents";

/** For a server-rendered page that has just changed something by being opened (mail marked read, for example): tells the rest of the screen. */
export function AnnounceOnMount({ kinds }: { kinds: LiveKind[] }) {
  useEffect(() => {
    announceChange(...kinds);
    // Once per visit to the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
