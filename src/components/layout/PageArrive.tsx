"use client";

import { useEffect, useRef, type ReactNode } from "react";

// The first page of a visit (a full load) just appears; every page after it, reached by moving inside the app, settles in.
let firstPage = true;

/**
 * Wraps one page. It re-mounts on every move between pages (it lives in template.tsx), so it plays the arrival once per page: the page
 * sharpens from a soft blur and rises a few pixels (`.page-arrive` in globals.css). Nothing else on the screen moves.
 */
export function PageArrive({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (firstPage) {
      firstPage = false;
      return;
    }
    el.classList.add("page-arrive");
    const done = window.setTimeout(() => el.classList.remove("page-arrive"), 420);
    return () => window.clearTimeout(done);
  }, []);
  return <div ref={ref}>{children}</div>;
}
