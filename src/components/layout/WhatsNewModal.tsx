"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ChangelogEntry } from "@/lib/changelog";
import { markPatchNotesSeenAction } from "@/app/(dashboard)/about/actions";
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

/** Shown once per calendar day (server-computed in (dashboard)/layout.tsx) — dismissing it marks lastSeenPatchNotesAt. */
export function WhatsNewModal({ show, entry }: { show: boolean; entry: ChangelogEntry }) {
  const [open, setOpen] = useState(show);

  async function handleClose() {
    setOpen(false);
    await markPatchNotesSeenAction();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
            className="glass-surface-elevated relative w-full max-w-sm overflow-hidden p-6"
          >
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">What&apos;s new · v{entry.version}</p>
            <h2 id="whats-new-title" className="mt-1.5 font-serif text-lg text-slate-50">
              {entry.title}
            </h2>

            <ul className="mt-4 space-y-2">
              {entry.items.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-slate-300">
                  <CheckIcon className="mt-1 shrink-0 text-[rgb(var(--c-a-400))]" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-6 flex items-center justify-between gap-4">
              <Link
                href="/about?tab=updates"
                onClick={handleClose}
                className="text-xs text-slate-500 transition hover:text-[rgb(var(--c-a-300))]"
              >
                Full update history
              </Link>
              <button
                type="button"
                onClick={handleClose}
                className="cta-sheen cta-fill shrink-0 rounded-lg px-4 py-2 text-xs font-semibold"
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
