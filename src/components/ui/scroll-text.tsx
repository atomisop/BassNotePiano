"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";

function Word({ word, progress, range }: { word: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.75, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block motion-reduce:!opacity-100">
      {word}
    </motion.span>
  );
}

/** A paragraph whose words light up one after another as it scrolls up the screen. With reduced motion every word is simply
    shown at full strength by CSS: the markup stays the same on the server and in the browser, so the page hydrates cleanly. */
export function ScrollText({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.9", "end 0.45"] });
  const words = text.trim().split(/\s+/);

  return (
    <p ref={ref} className={className}>
      {/* The whole sentence for assistive tech; the words below are only the scroll effect (an aria-label is not allowed on a paragraph). */}
      <span className="sr-only">{text}</span>
      <span aria-hidden className="flex flex-wrap gap-x-[0.28em]">
        {words.map((word, i) => {
          const start = i / words.length;
          const end = start + 1 / words.length;
          return <Word key={i} word={word} progress={scrollYProgress} range={[start, end]} />;
        })}
      </span>
    </p>
  );
}
