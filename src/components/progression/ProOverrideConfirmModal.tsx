"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MorphingSquare } from "@/components/ui/morphing-square";

export interface ProOverrideConfirmModalProps {
  isOpen: boolean;
  /** The scale's own code as shown on its roadmap card, e.g. "Scale 3" — must match exactly, not a derived number. */
  targetCode: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

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

/**
 * Curriculum-access "safe intercept" — shown when a curriculum holder
 * clicks a scale further ahead than the next one they haven't completed.
 * Confirming navigates with ?override=confirmed, which middleware.ts
 * whitelists for this scale and remembers via a short-lived cookie.
 */
export function ProOverrideConfirmModal({
  isOpen,
  targetCode,
  isConfirming = false,
  onConfirm,
  onCancel,
}: ProOverrideConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
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
            onClick={isConfirming ? undefined : onCancel}
          />

          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="override-modal-title"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="glass-surface-modal relative w-full max-w-sm p-6"
          >
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Curriculum access</p>
            <h2 id="override-modal-title" className="mt-1.5 font-serif text-lg text-slate-50">
              Skip ahead?
            </h2>
            <p className="mt-3 text-sm text-slate-400">
              Are you sure you want to unlock <span className="text-slate-200">{targetCode}</span> even though you
              haven&apos;t unlocked the levels before it?
            </p>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={isConfirming}
                className="flex-1 rounded-xl border border-ink/10 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isConfirming}
                className="cta-sheen cta-fill flex flex-1 items-center justify-center rounded-xl py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isConfirming && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                {isConfirming ? "Unlocking…" : "Confirm override"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
