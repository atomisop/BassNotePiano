"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { smoothScrollTo } from "@/components/scroll/SmoothScrollProvider";

/** Floating "back to top" pill — appears once the visitor has scrolled past
 * roughly one viewport height, since the homepage is a long single-page
 * scroller (hero, curriculum, instrument sections, pricing callout).
 * Homepage-only by placement, not a global fixture. */
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > window.innerHeight * 0.6);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleClick() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Routed through Lenis rather than window.scrollTo. With smooth scrolling
    // running, the native call is doubly broken: Lenis sets
    // `scroll-behavior: auto !important`, so "smooth" degrades to a hard jump,
    // and Lenis then eases from its own stale target and overshoots. The
    // helper falls back to the native call when Lenis isn't running.
    smoothScrollTo(0, reduceMotion);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={handleClick}
          aria-label="Back to top"
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.9 }}
          transition={{ type: "spring", bounce: 0, duration: 0.36 }}
          className="neu-btn fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full !text-slate-200 hover:!text-[rgb(var(--c-s-50))]"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
