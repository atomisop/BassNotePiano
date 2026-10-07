"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { RippleWaveLoader } from "@/components/ui/ripple-wave-loader";
import { endNavigation, useNavigationPending } from "@/lib/navigationState";

/**
 * Full-screen wait state for actions that end by changing screens: signing in,
 * creating an account, finishing onboarding, signing out. It waits a beat
 * before appearing so quick transitions stay clean, and clears when the new
 * page arrives.
 */
export function NavigationOverlay() {
  const pending = useNavigationPending();
  const pathname = usePathname();

  useEffect(() => {
    endNavigation();
  }, [pathname]);

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          key="nav-overlay"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.25, delay: 0.2 } }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          className="fixed inset-0 z-(--z-toast) flex items-center justify-center bg-scrim/70 backdrop-blur-sm"
        >
          <RippleWaveLoader />
          <span className="sr-only">Loading</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
