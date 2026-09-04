"use client";

import { cva } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * Morphing Square — a 21st.dev community loader ("Molecule UI"). Ported
 * as-is except for one import: the source uses the `motion` package
 * (Framer Motion's newer unified rebrand, imported as `motion/react`),
 * which isn't installed here and would duplicate `framer-motion`
 * (`^11.3.0`, already a dependency and used throughout this app). Framer
 * Motion 11 exports the same `motion` component and `HTMLMotionProps`
 * type under its own package name, so swapping the import is a drop-in
 * replacement with no behavior change — not worth carrying two animation
 * libraries for one component.
 */
const morphingSquareVariants = cva("flex gap-2 items-center justify-center", {
  variants: {
    messagePlacement: {
      bottom: "flex-col",
      top: "flex-col-reverse",
      right: "flex-row",
      left: "flex-row-reverse",
    },
  },
  defaultVariants: {
    messagePlacement: "bottom",
  },
});

export interface MorphingSquareProps {
  message?: string;
  /**
   * Position of the message relative to the spinner.
   * @default bottom
   */
  messagePlacement?: "top" | "bottom" | "left" | "right";
}

export function MorphingSquare({
  className,
  message,
  messagePlacement = "bottom",
  ...props
}: HTMLMotionProps<"div"> & MorphingSquareProps) {
  return (
    <div className={cn(morphingSquareVariants({ messagePlacement }))}>
      <motion.div
        className={cn("w-10 h-10 bg-foreground", className)}
        animate={{
          borderRadius: ["6%", "50%", "6%"],
          rotate: [0, 180, 360],
        }}
        transition={{
          duration: 2,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
        }}
        {...props}
      />
      {message && <div>{message}</div>}
    </div>
  );
}
