"use client";

import { motion } from "framer-motion";

/**
 * A green check mark that pops in on a spring while its stroke draws itself. The motion is adapted from
 * the "Success Login Card" by ruixen.ui on 21st.dev (spring scale 0 to 1, pathLength 0 to 1 on a
 * single-stroke check); only the check was taken, not the card. Respects reduced motion by framer-motion's
 * own handling of the user's setting (the stroke simply appears).
 */
export function AnimatedCheck({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <motion.span
      role="img"
      aria-label="Matches"
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      initial={{ opacity: 0, transform: "scale(0.9)" }}
      animate={{ opacity: 1, transform: "scale(1)" }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
    >
      <svg aria-hidden xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
        <motion.path initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1], delay: 0.05 }} d="M5 13l4 4L19 7" />
      </svg>
    </motion.span>
  );
}
