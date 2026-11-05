"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Wifi, WifiOff } from "@/components/ui/appIcons";

/**
 * A pill at the top of the screen while the device has no internet, and a short "Back online" when it returns (2026-10-31). The browser
 * only shows its own offline page when a new page is opened; while someone is already in the app it says nothing, and taps simply fail.
 * This tells them why. Mounted once for every page (providers.tsx).
 */
export function OfflineNotice() {
  const [offline, setOffline] = useState(false);
  const [backOnline, setBackOnline] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    // Read after mount: the server always renders "online", so the first paint matches.
    if (!navigator.onLine) setOffline(true);
    const goOffline = () => {
      if (timer.current) clearTimeout(timer.current);
      setBackOnline(false);
      setOffline(true);
    };
    const goOnline = () => {
      setOffline((was) => {
        if (was) {
          setBackOnline(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setBackOnline(false), 2500);
        }
        return false;
      });
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // While offline the top banners (phone number, Discord) step aside, so the one thing on screen is why nothing works (globals.css).
  useEffect(() => {
    if (offline) document.documentElement.dataset.offline = "";
    else delete document.documentElement.dataset.offline;
  }, [offline]);

  const show = offline || backOnline;
  const motionProps = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: -16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -16 } };

  return (
    <div className="pointer-events-none fixed inset-x-0 z-[90] flex justify-center px-4" style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}>
      <AnimatePresence>
        {show && (
          <motion.div
            key={offline ? "offline" : "online"}
            role={offline ? "alert" : "status"}
            {...motionProps}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className={
              offline
                ? "pointer-events-auto flex items-center gap-2.5 rounded-full bg-red-600 py-2.5 pr-5 pl-4 text-small font-semibold text-white shadow-lg"
                : "pointer-events-auto flex items-center gap-2.5 rounded-full bg-signal py-2.5 pr-5 pl-4 text-small font-semibold text-white shadow-lg"
            }
          >
            {offline ? <WifiOff aria-hidden className="h-5 w-5 shrink-0" /> : <Wifi aria-hidden className="h-5 w-5 shrink-0" />}
            <span>{offline ? "No internet connection" : "Back online"}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
