"use client";

import { motion } from "framer-motion";
import { SPRING } from "@/lib/motionTokens";

/**
 * A formatted number whose digits roll into place when it changes, the way a price or a total does in a good checkout:
 * each digit is a short reel (0 to 9) that slides to the new digit, so the eye sees the change instead of missing it.
 * Pass the text already formatted ("$59.99"). Anything that is not a digit is drawn as it is. Digits are keyed from the
 * right, so "$9.99" growing to "$19.99" keeps the cents in place and only adds a reel on the left.
 * Reduced motion is handled by the app-wide MotionConfig (the reel simply lands).
 */
export function RollingNumber({ text, className = "" }: { text: string; className?: string }) {
  const chars = [...text];
  return (
    <span role="text" aria-label={text} className={`inline-flex tabular-nums ${className}`}>
      {chars.map((ch, i) => {
        const fromRight = chars.length - i;
        if (!/\d/.test(ch)) {
          return (
            <span key={`s-${fromRight}`} aria-hidden className="inline-block">
              {ch}
            </span>
          );
        }
        return <Reel key={`d-${fromRight}`} digit={Number(ch)} />;
      })}
    </span>
  );
}

function Reel({ digit }: { digit: number }) {
  return (
    <span aria-hidden className="relative inline-block h-[1.15em] overflow-hidden leading-[1.15]">
      {/* The visible digit sets the width, so the reel is exactly one character wide. */}
      <span className="invisible">{digit}</span>
      <motion.span className="absolute inset-x-0 top-0 flex flex-col" initial={false} animate={{ y: `${-digit * 10}%` }} transition={SPRING.smooth}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span key={n} className="block h-[1.15em] text-center">
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}
