"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** How long the check's script gets to arrive before we say it is blocked. */
const LOAD_TIMEOUT_MS = 12_000;

/**
 * Where the check is, so a form can tell the person instead of failing quietly:
 * "off" no site key (nothing to do), "loading" waiting for the script or the answer, "ready" a token is in hand,
 * "blocked" the script never loaded or the check errored (an ad blocker, a privacy setting or a network filter is the usual cause).
 */
export type CaptchaState = "off" | "loading" | "ready" | "blocked";

/**
 * Renders nothing unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. `resetKey` changes to request a fresh token.
 * `onState` reports where the check is (see CaptchaState). When the check cannot load, the widget says so itself, in words, and offers
 * "Try again", so no form is left with a submit button that can never work and nothing on screen explaining why.
 */
export function TurnstileWidget({
  action,
  onToken,
  onState,
  resetKey = 0,
}: {
  action: string;
  onToken: (token: string) => void;
  onState?: (state: CaptchaState) => void;
  resetKey?: number;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const [state, setState] = useState<CaptchaState>(siteKey ? "loading" : "off");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onState?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let cancelled = false;
    let timer: number | undefined;
    let script: HTMLScriptElement | null = null;
    setState("loading");

    const fail = () => {
      if (cancelled) return;
      onToken("");
      setState("blocked");
    };
    const mount = () => {
      if (cancelled || !ref.current || !window.turnstile) return;
      window.clearTimeout(timer);
      try {
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          action,
          callback: (token: string) => {
            onToken(token);
            if (!cancelled) setState("ready");
          },
          "expired-callback": () => {
            onToken("");
            if (!cancelled) setState("loading");
          },
          "error-callback": fail,
        });
      } catch {
        fail();
      }
    };
    const onScriptError = () => {
      // Taken out again so "Try again" fetches it afresh instead of finding a dead tag.
      script?.remove();
      fail();
    };

    if (window.turnstile) mount();
    else {
      script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", mount);
      script.addEventListener("error", onScriptError);
      timer = window.setTimeout(() => {
        if (!window.turnstile) onScriptError();
      }, LOAD_TIMEOUT_MS);
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      script?.removeEventListener("load", mount);
      script?.removeEventListener("error", onScriptError);
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, resetKey, attempt]);

  if (!siteKey) return null;
  return (
    <div>
      <div ref={ref} className={state === "blocked" ? undefined : "min-h-[65px]"} />
      {state === "blocked" && (
        <p role="alert" className="text-small text-red-400">
          The quick human check didn&apos;t load. An ad blocker or privacy setting may be blocking it: turn it off for this site or try another browser, then{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="tap inline-flex items-center font-medium underline underline-offset-4">
            try again
          </button>
          .
        </p>
      )}
    </div>
  );
}
