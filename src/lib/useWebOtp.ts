"use client";

import { useEffect } from "react";

/**
 * Reads a text-message code for the person (Chrome on Android's WebOTP API) and hands it over, so they need not copy it.
 * Only works for an SMS that ends with "@host #code" (the web origin one-time code format). Anywhere the API is missing (iPhone
 * fills the code from the keyboard through autocomplete="one-time-code" instead) it quietly does nothing.
 */
export function useWebOtp(active: boolean, onCode: (code: string) => void) {
  useEffect(() => {
    if (!active || typeof window === "undefined" || !("OTPCredential" in window)) return;
    const abort = new AbortController();
    const credentials = navigator.credentials as unknown as { get: (options: { otp: { transport: string[] }; signal: AbortSignal }) => Promise<{ code?: string } | null> };
    credentials
      .get({ otp: { transport: ["sms"] }, signal: abort.signal })
      .then((otp) => {
        const code = otp?.code?.replace(/\D/g, "");
        if (code) onCode(code.slice(0, 6));
      })
      .catch(() => undefined);
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
