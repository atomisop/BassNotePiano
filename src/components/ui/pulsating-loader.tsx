"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Three pulsing dots, for a short wait inside a card or section. Ported from
 * a 21st.dev loader; the dots use the brand signal color instead of red, and
 * reduced motion is handled app-wide by MotionConfig.
 */
export default function PulsatingDots({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center", className)} aria-hidden>
      <div className="flex space-x-2">
        {[0, 0.3, 0.6].map((delay) => (
          <motion.div
            key={delay}
            className="h-3 w-3 rounded-full bg-signal"
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1, ease: "easeInOut", repeat: Infinity, delay }}
          />
        ))}
      </div>
    </div>
  );
}

export { PulsatingDots };
