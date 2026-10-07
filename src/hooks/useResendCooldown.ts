"use client";

import { useCallback, useEffect, useState } from "react";

/** How long the resend button rests after a click. Matches the point of the server's own limit: codes cannot be requested over and over. */
export const RESEND_COOLDOWN_SECONDS = 60;
/** After this many resends the page suggests contacting the studio, since more codes will not help. */
export const RESEND_CLICKS_BEFORE_HELP = 3;

/** A resend button's state: a countdown after each click, and how many times it was used. */
export function useResendCooldown(): { secondsLeft: number; clicks: number; start: () => void } {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [clicks, setClicks] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  const start = useCallback(() => {
    setSecondsLeft(RESEND_COOLDOWN_SECONDS);
    setClicks((n) => n + 1);
  }, []);

  return { secondsLeft, clicks, start };
}
