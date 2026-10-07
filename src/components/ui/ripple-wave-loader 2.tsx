"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * A row of bars that ripple like a sound wave, which suits a music app. Ported
 * from a 21st.dev loader; bars use the brand signal color instead of red, and
 * reduced motion is handled app-wide by MotionConfig.
 */
export default function RippleWaveLoader({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center space-x-1", className)} aria-hidden>
      {Array.from({ length: 7 }).map((_, index) => (
        <motion.div
          key={index}
          className="h-8 w-2 rounded-full bg-signal"
          animate={{ scaleY: [0.5, 1.5, 0.5], scaleX: [1, 0.8, 1], translateY: ["0%", "-15%", "0%"] }}
          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: index * 0.1 }}
        />
      ))}
    </div>
  );
}

export { RippleWaveLoader };
