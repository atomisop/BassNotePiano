"use client";

import { useRef } from "react";
import { motion, useMotionValue, useMotionTemplate, useSpring, useReducedMotion } from "framer-motion";

interface TiltGlowProps {
  children: React.ReactNode;
  className?: string;
  /** Max tilt in degrees. Kept small deliberately — this should read as a physical material reacting to light, not a gimmick. */
  maxTilt?: number;
}

/**
 * Cursor-reactive tilt + specular highlight for hero-level `.glass-surface-elevated`
 * panels. Wrap ONE element per screen — this is reserved for the primary surface,
 * same rule as .glass-surface-elevated itself.
 */
export function TiltGlow({ children, className = "", maxTilt = 5 }: TiltGlowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const rotateX = useSpring(0, { stiffness: 200, damping: 20 });
  const rotateY = useSpring(0, { stiffness: 200, damping: 20 });
  const glowX = useMotionValue(50);
  const glowY = useMotionValue(50);
  // A warm rust wash rather than the old light bloom: on a white card a
  // light-on-light highlight is invisible, so the specular reads as a faint
  // tint gathering under the cursor instead.
  const glow = useMotionTemplate`radial-gradient(360px circle at ${glowX}% ${glowY}%, rgba(160,78,30,0.10), transparent 70%)`;

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (prefersReducedMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    rotateY.set(((px - 50) / 50) * maxTilt);
    rotateX.set(((50 - py) / 50) * maxTilt);
    glowX.set(px);
    glowY.set(py);
  }

  function handleMouseLeave() {
    rotateX.set(0);
    rotateY.set(0);
    glowX.set(50);
    glowY.set(50);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX: prefersReducedMotion ? 0 : rotateX,
        rotateY: prefersReducedMotion ? 0 : rotateY,
        transformStyle: "preserve-3d",
        backgroundImage: prefersReducedMotion ? undefined : glow,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
