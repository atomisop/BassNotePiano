"use client";

import { SessionProvider } from "next-auth/react";
import { MotionConfig } from "framer-motion";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* reducedMotion="user": every framer-motion element site-wide collapses
          spring/tween animations to their end-state under prefers-reduced-motion
          automatically — a blanket safety net on top of the manual useReducedMotion()
          checks in components with genuinely different reduced-motion behavior
          (PhotoBackdrop's parallax, TiltGlow's tilt, etc.), not a replacement for them. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </SessionProvider>
  );
}
