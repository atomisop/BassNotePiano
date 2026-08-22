"use client";

import { motion } from "framer-motion";
import { SuccessGlowPulse } from "@/components/ui/SuccessGlowPulse";

// Same settle-in celebration language as QuizModal's passed state and
// ZellePaymentModal's confirmation step — reused, not reinvented, per the
// brief. Spring values match the rest of the app's entrance pattern.
const panelVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

export function SectionCompleteCelebration({
  onNextSection,
  hasNextSection,
  onCourseDetails,
}: {
  onNextSection: () => void;
  hasNextSection: boolean;
  onCourseDetails: () => void;
}) {
  return (
    <motion.div variants={panelVariants} initial="hidden" animate="visible" className="glass-surface-elevated relative mx-auto max-w-md overflow-hidden p-8 text-center">
      <SuccessGlowPulse />
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", bounce: 0.35, duration: 0.5, delay: 0.05 }}
        className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10"
      >
        <motion.svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-emerald-400"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </motion.div>
      <h3 className="relative font-serif text-xl text-slate-50">Congratulations!</h3>
      <p className="relative mx-auto mt-1.5 max-w-xs text-sm text-slate-400">You&apos;ve finished this section.</p>
      <div className="relative mt-6 flex gap-2">
        <button
          type="button"
          onClick={onCourseDetails}
          className="flex-1 rounded-xl border border-ink/10 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
        >
          Course Details
        </button>
        {hasNextSection && (
          <button
            type="button"
            onClick={onNextSection}
            className="cta-sheen cta-fill flex-1 rounded-xl py-2.5 text-sm font-semibold"
          >
            Next Section
          </button>
        )}
      </div>
    </motion.div>
  );
}
