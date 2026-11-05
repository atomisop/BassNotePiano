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
const FALLBACK_FILL = "rgb(21 21 21)";

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

/**
 * Sileo only stretches into its gooey two-part shape (a small title pill with the body hanging below it, joined by a blob neck)
 * when a toast has a body. A bare one-line toast stays a flat pill and never morphs. So a toast given only a message shows a
 * short label in the pill and the message as the body; one given its own description keeps its own title.
 */
const PILL_LABEL = { success: "Done", error: "Something went wrong", warning: "Heads up", info: "Note" } as const;

function withBody(kind: keyof typeof PILL_LABEL, title: string, description?: SileoOptions["description"]) {
  return description ? { title, description } : { title: PILL_LABEL[kind], description: title };
}

function show(kind: "success" | "error" | "warning" | "info") {
  return (title: string, extras: ToastExtras = {}) =>
    sileo[kind]({
      ...withBody(kind, title, extras.description),
      duration: extras.duration,
      button: extras.action ? { title: extras.action.label, onClick: extras.action.onClick } : undefined,
    });
}

/**
 * A toast that can be taken back: shows an Undo button for a few seconds. Pass what to do on Undo; it is not called if the toast is
 * ignored. Use it for quick actions that are cheap to reverse (a removed item, a dismissed notice) instead of a confirm step.
 */
function undo(title: string, onUndo: () => void | Promise<void>, extras: Omit<ToastExtras, "action"> = {}) {
  return sileo.info({
    ...withBody("info", title, extras.description),
    duration: extras.duration ?? 6000,
    button: {
      title: "Undo",
      onClick: () => {
        void onUndo();
      },
    },
  });
}

/**
 * One toast that follows a promise: a spinner while it runs, then success or the error. `error` may be a function of the thrown value.
 * Resolves to the promise's own result so the caller can keep using it.
 */
async function run<T>(
  work: Promise<T>,
  messages: { loading: string; success: string | ((value: T) => string); error?: string | ((err: unknown) => string) },
): Promise<T> {
  const id = sileo.info({ title: messages.loading, duration: null });
  try {
    const value = await work;
    sileo.dismiss(id);
    sileo.success(withBody("success", typeof messages.success === "function" ? messages.success(value) : messages.success));
    return value;
  } catch (err) {
    sileo.dismiss(id);
    const text = typeof messages.error === "function" ? messages.error(err) : (messages.error ?? "Something went wrong. Try again.");
    sileo.error(withBody("error", text));
    throw err;
  }
}

export const toast = {
  undo,
  run,
  success: show("success"),
  error: show("error"),
  warning: show("warning"),
  info: show("info"),
  promise: sileo.promise,
  dismiss: sileo.dismiss,
  clear: sileo.clear,
};

export { sileo };
