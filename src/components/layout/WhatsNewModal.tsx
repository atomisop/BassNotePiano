"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ChangelogEntry } from "@/lib/changelog";
import { CheckIcon } from "@/components/ui/icons";

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const panelVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", bounce: 0, duration: 0.32 },
  },
  exit: {
    opacity: 0,
    y: 16,
    scale: 0.97,
    transition: { duration: 0.15, ease: "easeIn" },
  },
};

const SEEN_KEY = "bnp-whats-new-seen";

/** Shown once per device for each new changelog version: this browser remembers the last version it showed. */
export function WhatsNewModal({ suppress, entry }: { suppress: boolean; entry: ChangelogEntry }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (suppress) return;
    try {
      if (window.localStorage.getItem(SEEN_KEY) !== entry.version) setOpen(true);
    } catch {
      // Storage blocked: stay quiet rather than show it on every visit.
    }
  }, [suppress, entry.version]);

  function handleClose() {
    setOpen(false);
    try {
      window.localStorage.setItem(SEEN_KEY, entry.version);
    } catch {
      // Nothing to remember it with; it just won't come back this session.
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          <motion.div
            variants={backdropVariants}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-scrim/60"
            onClick={handleClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="whats-new-title"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="glass-surface-modal relative max-h-[88dvh] w-full max-w-sm overflow-y-auto overscroll-contain p-6"
          >
            <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">What&apos;s new · v{entry.version}</p>
            <h2 id="whats-new-title" className="mt-1.5 text-body text-slate-50 font-semibold">
              {entry.title}
            </h2>

            <ul className="mt-4 space-y-2">
              {entry.items.map((item) => (
                <li key={item} className="flex gap-2.5 text-small text-slate-300">
                  <CheckIcon className="mt-1 shrink-0 text-[rgb(var(--c-s-50))]" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-6 flex items-center justify-between gap-4">
              <Link
                href="/about?tab=updates"
                onClick={handleClose}
                className="tap inline-flex items-center text-small text-slate-500 transition hover:text-[rgb(var(--c-s-50))]"
              >
                Full update history
              </Link>
              <button
                type="button"
                onClick={handleClose}
                className="tap cta-sheen cta-fill shrink-0 rounded-lg px-4 py-2 text-small font-semibold"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
