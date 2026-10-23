"use client";

import { useEffect, useState } from "react";
import { Toaster as SileoToaster, sileo, type SileoOptions } from "sileo";

/**
 * Toast notifications, built on Sileo (gooey SVG body, spring physics).
 *
 * Sileo paints its toast body as an SVG `fill`, so the colour has to be a real
 * value, not a class. This app has several themes driven by the ramp in
 * themes.css, so the wrapper reads the live `--neu-base` from <html> and
 * hands Sileo that, and watches `data-theme` / `data-mode` so a theme switch
 * recolours the next toast. Text colours come from the rules in globals.css
 * (`[data-sileo-*]`), which use the same slate ramp as every other panel.
 *
 * Sileo has no green-for-success rule of its own to fight: its state colours
 * are overridden in globals.css to the app's (paper text for success, red for
 * errors), because green means "tap this" only.
 */
const FALLBACK_FILL = "rgb(38 38 36)";

function readToastFill(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--neu-base").trim();
  return raw ? `rgb(${raw})` : FALLBACK_FILL;
}

export function Toaster() {
  const [fill, setFill] = useState(FALLBACK_FILL);

  useEffect(() => {
    const update = () => setFill(readToastFill());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-mode", "class"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <SileoToaster
      // Top centre: Atom (bottom right) and the dock (bottom) both live at the
      // bottom of every screen, so a toast there would sit under them.
      position="top-center"
      offset={{ top: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
      options={{ fill }}
    />
  );
}

/**
 * Same call shape the app used with Sonner, `toast.error("Title", { description,
 * action: { label, onClick } })`, so call sites stay one line. Sileo's own
 * `sileo` object is exported for anything that needs `promise`.
 */
type ToastExtras = {
  description?: SileoOptions["description"];
  action?: { label: string; onClick: () => void };
  duration?: number | null;
};

function show(kind: "success" | "error" | "warning" | "info") {
  return (title: string, extras: ToastExtras = {}) =>
    sileo[kind]({
      title,
      description: extras.description,
      duration: extras.duration,
      button: extras.action ? { title: extras.action.label, onClick: extras.action.onClick } : undefined,
    });
}

export const toast = {
  success: show("success"),
  error: show("error"),
  warning: show("warning"),
  info: show("info"),
  promise: sileo.promise,
  dismiss: sileo.dismiss,
  clear: sileo.clear,
};

export { sileo };
