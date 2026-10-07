"use client";

import { motion } from "framer-motion";
import { RippleWaveLoader } from "@/components/ui/ripple-wave-loader";
import { cn } from "@/lib/utils";

/**
 * The wait state for a whole page or section. It fades in after a short beat,
 * so a navigation that finishes quickly never flashes a loader. Used by every
 * route's loading.tsx; the same wave appears in NavigationOverlay for waits
 * that follow a button press (signing in, finishing onboarding).
 */
export function PageLoader({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className={cn("flex min-h-[50svh] flex-col items-center justify-center gap-4", className)}
    >
      <RippleWaveLoader />
      <span className="sr-only">{label}</span>
    </motion.div>
  );
}
