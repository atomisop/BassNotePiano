"use client";

import { useEffect, useState } from "react";
import { onChange } from "@/lib/liveEvents";
import { myLinkedChildrenAction } from "@/app/(dashboard)/parent/actions";

type Kid = { id: string; name: string };

// One look per page load, shared by the sidebar and the profile menu (both ask at once when the app opens).
let shared: Promise<Kid[]> | null = null;
function load(fresh: boolean): Promise<Kid[]> {
  if (fresh || !shared) shared = myLinkedChildrenAction().catch(() => []);
  return shared;
}

/**
 * The children this person manages in parent mode (accepted links). Empty for everyone else, so the Parent mode entry only appears for a
 * parent. Looked up once when the app opens and again when an action says the account changed.
 */
export function useLinkedChildren(enabled = true): Kid[] {
  const [kids, setKids] = useState<Kid[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const apply = (fresh: boolean) => void load(fresh).then((k) => alive && setKids(k));
    apply(false);
    const stop = onChange("status", () => apply(true));
    return () => {
      alive = false;
      stop();
    };
  }, [enabled]);
  return kids;
}
