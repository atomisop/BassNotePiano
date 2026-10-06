"use client";

// From 21st.dev: Text Reveal by ddoemonn. Adapted: imports framer-motion (the
// package this app uses) instead of motion/react, and drops the default color.
import { Fragment, useMemo, useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

const EASE = [0.23, 1, 0.32, 1] as const;
const DURATION = 0.6;

const HIDDEN = { opacity: 0, y: 10, filter: "blur(8px)" } as const;
const SHOWN = { opacity: 1, y: 0, filter: "blur(0px)" } as const;

export type TextRevealProps = {
  text: string;
  stagger?: number;
  maxDuration?: number;
  /** Seconds to wait after the text scrolls into view. */
  delay?: number;
  className?: string;
};

export function TextReveal({ text, stagger = 0.055, maxDuration = 1.6, delay = 0, className = "" }: TextRevealProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const reduced = useReducedMotion();

  const { words, step } = useMemo(() => {
    const list = text.trim().length ? text.trim().split(/\s+/) : [];
    const span = Math.max(0, maxDuration - DURATION);
    return { words: list, step: list.length > 1 ? Math.min(stagger, span / (list.length - 1)) : 0 };
  }, [text, stagger, maxDuration]);

  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, i) => (
          <Fragment key={i}>
            {i > 0 ? " " : null}
            <span className="inline-block whitespace-nowrap align-baseline">
              <motion.span
                className="inline-block align-baseline"
                initial={reduced ? false : HIDDEN}
                animate={inView ? SHOWN : HIDDEN}
                transition={reduced ? { duration: 0 } : { duration: DURATION, ease: EASE, delay: inView ? delay + i * step : 0 }}
              >
                {word}
              </motion.span>
            </span>
          </Fragment>
        ))}
      </span>
    </span>
  );
}

export default TextReveal;
