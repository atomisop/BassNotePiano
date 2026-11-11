"use client";

import { motion } from "framer-motion";
import { SPRING } from "@/lib/motionTokens";
import styles from "./RollingNumber.module.css";

/**
 * A formatted number whose digits roll into place when it changes, the way a price or a total does in a good checkout:
 * each digit is a short reel (0 to 9) that slides to the new digit, so the eye sees the change instead of missing it.
 * Pass the text already formatted ("$59.99"). Anything that is not a digit is drawn as it is. Digits are keyed from the
 * right, so "$9.99" growing to "$19.99" keeps the cents in place and only adds a reel on the left.
 * The digits are drawn by CSS, so the DOM text is the price once (an sr-only span). Reduced motion is handled by the app-wide MotionConfig (the reel simply lands).
 */
export function RollingNumber({ text, className = "" }: { text: string; className?: string }) {
  const chars = [...text];
  return (
    <span className={`inline-flex items-baseline tabular-nums ${className}`}>
      {/* The one real copy of the price: read by screen readers and crawlers, and copyable. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex items-baseline select-none">
        {chars.map((ch, i) => {
          const fromRight = chars.length - i;
          if (!/\d/.test(ch)) {
            return (
              <span key={`s-${fromRight}`} className="inline-block">
                {ch}
              </span>
            );
          }
          return <Reel key={`d-${fromRight}`} digit={Number(ch)} />;
        })}
      </span>
    </span>
  );
}

function Reel({ digit }: { digit: number }) {
  return (
    <span className="relative inline-block h-[1.15em] w-[1ch] overflow-hidden leading-[1.15]">
      {/* A clipped box has no baseline of its own (it would sit on its bottom edge, so the digits rode above the words around them).
          This unseen "0", drawn by CSS so the page text still holds the price once, gives the reel the digits' real baseline. */}
      <span aria-hidden className="invisible before:content-['0']" />
      <motion.span className="absolute inset-x-0 top-0 block" initial={false} animate={{ y: `${-digit * 10}%` }} transition={SPRING.smooth}>
        <span className={styles.strip} style={{ display: "block" }} />
      </motion.span>
    </span>
  );
}
