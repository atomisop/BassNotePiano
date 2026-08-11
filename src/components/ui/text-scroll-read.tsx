"use client";

import { cn } from "@/lib/utils";
import {
  type HTMLMotionProps,
  motion,
  type MotionValue,
  type UseScrollOptions,
  useScroll,
  useTransform,
} from "framer-motion";
import * as React from "react";

/**
 * Scroll-driven reading illumination — text arrives dim and is lit left to
 * right as the reader scrolls past it, like a highlighter tracking the line.
 *
 * Adapted from 21st.dev's `text-scroll-read` (@youcefbnm) with three changes
 * this app needs:
 *
 *  1. The original hardcodes `rgb(0,0,0)` for lit text and a 5%-black wash for
 *     unlit, which is invisible on any dark theme and can't follow the 35
 *     palettes in themes.css. Both ends are now ramp tokens.
 *  2. It imports from `motion/react`; this project is on `framer-motion` v11.
 *  3. `ClipText` could only ever run off its own `useScroll`. It now accepts
 *     an optional external `progress` MotionValue, which is what lets the
 *     scrollytelling scene light its copy from the *scene's* local progress
 *     instead of the element's own position — the element never moves inside
 *     a pinned stage, so self-measurement reports nothing there.
 */

interface TextScrollReadContextValue {
  scrollYProgress: MotionValue<number>;
}

const TextScrollReadContext = React.createContext<TextScrollReadContextValue | undefined>(
  undefined,
);

export function useTextScrollReadContext() {
  const context = React.useContext(TextScrollReadContext);
  if (!context) {
    throw new Error("useTextScrollReadContext must be used within <TextScrollRead>");
  }
  return context;
}

interface TextScrollReadProps extends React.HTMLAttributes<HTMLDivElement> {
  offset?: UseScrollOptions["offset"];
  wrapperClassName?: string;
  spaceClass?: string;
}

export function TextScrollRead({
  spaceClass,
  offset = ["start end", "center start"],
  children,
  className,
  ...props
}: TextScrollReadProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset });

  return (
    <TextScrollReadContext.Provider value={{ scrollYProgress }}>
      <div ref={ref} className={cn("relative", className)} {...props}>
        {children}
        <div className={cn("h-60", spaceClass)} />
      </div>
    </TextScrollReadContext.Provider>
  );
}

export function TextScrollReadWrap({
  yInput = [0, 1],
  yRange = [0, 240],
  style,
  ...props
}: HTMLMotionProps<"div"> & { yInput?: number[]; yRange?: number[] }) {
  const { scrollYProgress } = useTextScrollReadContext();
  const y = useTransform(scrollYProgress, yInput, yRange);

  return <motion.div style={{ y, willChange: "transform", ...style }} {...props} />;
}

export interface ClipTextProps extends HTMLMotionProps<"span"> {
  /**
   * Drive the sweep from an external progress value (0 → 1). When omitted the
   * component falls back to the nearest <TextScrollRead> context.
   */
  progress?: MotionValue<number>;
}

export function ClipText({ className, style, progress, ...props }: ClipTextProps) {
  const context = React.useContext(TextScrollReadContext);
  const source = progress ?? context?.scrollYProgress;

  if (!source) {
    throw new Error("<ClipText> needs either a `progress` prop or a <TextScrollRead> ancestor");
  }

  const backgroundPositionX = useTransform(source, [0, 1], ["100%", "0%"]);

  return (
    <motion.span
      className={cn(
        "bg-scroll bg-clip-text bg-no-repeat text-transparent bg-[length:200%_100%]",
        // The hard 50% stop is the trick: a two-tone gradient twice the width
        // of the text, slid across it, reads as a moving edge rather than a
        // fade — which is what makes it look like reading rather than like an
        // opacity animation.
        "bg-[linear-gradient(-90deg,rgb(var(--c-s-500)/0.32)_50%,rgb(var(--c-s-50))_50%)]",
        className,
      )}
      style={{ backgroundPositionX, ...style }}
      {...props}
    />
  );
}

export default TextScrollRead;
