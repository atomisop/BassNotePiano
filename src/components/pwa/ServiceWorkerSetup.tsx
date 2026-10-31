"use client";

import { useEffect } from "react";

/**
 * Installs the app's service worker (public/sw.js) on every visit, so the "You're offline" page is already on the device before the
 * connection drops. It asks for nothing (push reminders still need their own yes in Settings). Production only: in development a service
 * worker would get in the way of reloading changes.
 */
export function ServiceWorkerSetup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
