"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Counts a view of the public page. Sends only the path, and nothing about the visitor. */
export function PageHitBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof navigator !== "undefined" && (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl)) return;
    void fetch("/api/analytics/hit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);
  return null;
}
