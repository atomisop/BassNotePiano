"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ThemePicker } from "./ThemePicker";

/**
 * The logged-out entry point to theming, for the marketing nav.
 *
 * Deliberately an icon rather than a labelled "Adjust looks" button: this bar
 * is the conversion path, and a labelled control here competes with the
 * primary CTA for attention on a page people spend under a minute on. The
 * icon keeps the option discoverable for the people who actually want it
 * (dark mode especially) without bidding against "Start learning".
 *
 * Signed-in users get the full version at Settings → Themes & Appearance.
 */
export function ThemeMenuButton() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Adjust appearance"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Adjust appearance"
        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-ink/5 hover:text-amber-300"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[18px] w-[18px]">
          <path
            d="M12 3a9 9 0 000 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1-.24-.27-.39-.62-.39-1 0-.83.67-1.5 1.5-1.5H16a5 5 0 005-5c0-4.42-4.03-8-9-8z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="7.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="10.5" cy="8" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Appearance"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="glass-surface absolute right-0 top-full z-50 mt-2 origin-top-right"
          >
            <ThemePicker compact />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
