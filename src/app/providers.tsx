"use client";

import { usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from "@/components/ui/Toaster";
import { OfflineNotice } from "@/components/ui/OfflineNotice";
import { ServiceWorkerSetup } from "@/components/pwa/ServiceWorkerSetup";
import { LaunchSplash } from "@/components/pwa/LaunchSplash";
import { NavigationOverlay } from "@/components/layout/NavigationOverlay";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { NavTracker } from "@/components/layout/NavTracker";
import { KeyboardAvoider } from "@/components/layout/KeyboardAvoider";
import { LiquidPress } from "@/components/layout/LiquidPress";
import { GlassButtons } from "@/components/layout/GlassButtons";

// Sign-in, sign-up and password screens: nothing to ask Atom about yet, and the
// launcher only gets in the way of the form. Unmounting (not just hiding) also
// stops its polling and greeting timers on these pages.
const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];

function AtomUnlessAuth() {
  const pathname = usePathname();
  if (pathname && AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return <AssistantWidget />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* reducedMotion="user": every framer-motion element site-wide collapses
          spring/tween animations to their end-state under prefers-reduced-motion
          automatically, a blanket safety net on top of the manual useReducedMotion()
          checks in components with genuinely different reduced-motion behavior
          (PhotoBackdrop's parallax, TiltGlow's tilt, etc.), not a replacement for them. */}
      <MotionConfig reducedMotion="user">
        <ThemeProvider>
          {children}
          {/* Mounted inside ThemeProvider so toasts inherit the live theme's
              ramp, they're rendered in a portal, but the CSS variables they
              resolve against come from <html data-theme>, which this sets. */}
          <Toaster />
          <OfflineNotice />
          <ServiceWorkerSetup />
          <LaunchSplash />
          {/* Same reasoning as Toaster: mounted here (not in a single route)
              so it appears on every page, marketing, auth, and the
              authenticated app, using whatever theme is active on each. */}
          <CookieConsentBanner />
          {/* Atom, the assistant widget, same "every page, one mount point"
              reasoning as Toaster/CookieConsentBanner above, except on the
              auth screens (see AtomUnlessAuth). */}
          <AtomUnlessAuth />
          <NavigationOverlay />
          <NavTracker />
          <KeyboardAvoider />
          <LiquidPress />
          <GlassButtons />
        </ThemeProvider>
      </MotionConfig>
    </SessionProvider>
  );
}
