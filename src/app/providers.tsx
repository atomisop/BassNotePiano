"use client";

import { SessionProvider } from "next-auth/react";
import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from "@/components/ui/Toaster";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* reducedMotion="user": every framer-motion element site-wide collapses
          spring/tween animations to their end-state under prefers-reduced-motion
          automatically — a blanket safety net on top of the manual useReducedMotion()
          checks in components with genuinely different reduced-motion behavior
          (PhotoBackdrop's parallax, TiltGlow's tilt, etc.), not a replacement for them. */}
      <MotionConfig reducedMotion="user">
        <ThemeProvider>
          {children}
          {/* Mounted inside ThemeProvider so toasts inherit the live theme's
              ramp — they're rendered in a portal, but the CSS variables they
              resolve against come from <html data-theme>, which this sets. */}
          <Toaster />
          {/* Same reasoning as Toaster: mounted here (not in a single route)
              so it appears on every page — marketing, auth, and the
              authenticated app — using whatever theme is active on each. */}
          <CookieConsentBanner />
          {/* Atom, the assistant widget — same "every page, one mount point"
              reasoning as Toaster/CookieConsentBanner above. */}
          <AssistantWidget />
        </ThemeProvider>
      </MotionConfig>
    </SessionProvider>
  );
}
