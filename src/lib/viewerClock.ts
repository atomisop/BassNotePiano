"use client";
import { useEffect, useState } from "react";

/**
 * Times in the booking screens are shown in the viewer's own clock and language, which the server cannot know. The first paint (the
 * server's, and the browser's matching one) therefore uses the studio's Eastern clock in US English, and the viewer's own take over as
 * soon as the page is alive. Without this the page logged a hydration mismatch for everyone whose clock or language differs from the
 * server's. Format helpers read viewerLocale() and viewerZone(); the screen's root calls useViewerClockReady() so it redraws once.
 */
let ready = false;
export const viewerLocale = (): string | undefined => (ready ? undefined : "en-US");
export const viewerZone = (): string | undefined => (ready ? undefined : "America/New_York");

export function useViewerClockReady(): boolean {
  const [isReady, setIsReady] = useState(ready);
  useEffect(() => {
    ready = true;
    setIsReady(true);
  }, []);
  return isReady;
}
