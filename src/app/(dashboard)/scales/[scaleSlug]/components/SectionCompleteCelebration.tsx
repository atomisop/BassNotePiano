"use client";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { motion } from "framer-motion";
import { SuccessGlowPulse } from "@/components/ui/SuccessGlowPulse";
import { SPRING } from "@/lib/motionTokens";

// Same settle-in celebration language as QuizModal's passed state and
// ZellePaymentModal's confirmation step, reused, not reinvented, per the
// brief. Spring values match the rest of the app's entrance pattern.
const panelVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: SPRING.smooth },
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
    <motion.div variants={panelVariants} initial="hidden" animate="visible" className="relative mx-auto w-full max-w-md overflow-hidden rounded-card bg-[rgb(var(--plane-mid-bg))] p-8 text-center shadow-plane-mid">
      <SuccessGlowPulse />
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...SPRING.lively, delay: 0.05 }}
        className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-50/8"
      >
        <motion.svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-50"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </motion.div>
      <h3 className="relative text-body font-semibold text-slate-50">Lesson complete</h3>
      <p className="relative mx-auto mt-1 max-w-xs text-small text-slate-400">Saved to your progress.</p>
      <div className="relative mt-6 flex gap-2">
        <button
          type="button"
          onClick={onCourseDetails}
          className={cn(buttonVariants({ variant: "secondary" }), "flex-1")}
        >
          Review this lesson
        </button>
        {hasNextSection && (
          <button
            type="button"
            onClick={onNextSection}
            className={cn(buttonVariants(), "flex-1")}
          >
            Next lesson
          </button>
        )}
      </div>
    </motion.div>
  );
}
