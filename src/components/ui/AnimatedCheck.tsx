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
        {/* First the circle draws, then the tick, so watching it finish makes the moment feel done. */}
        <motion.circle cx="12" cy="12" r="10" initial={{ pathLength: 0, opacity: 0.9 }} animate={{ pathLength: 1, opacity: 0.9 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} strokeWidth={1.8} />
        <motion.path initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], delay: 0.38 }} d="M7.5 12.5l3 3 6-6.5" />
      </svg>
    </motion.span>
  );
}
