"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordNavigation } from "@/lib/navHistory";

/** Remembers each page the person visits so Back buttons can return to the real previous page. Renders nothing. */
export function NavTracker() {
  const pathname = usePathname();
  useEffect(() => {
    recordNavigation(`${pathname}${window.location.search}`);
  }, [pathname]);
  return null;
}
