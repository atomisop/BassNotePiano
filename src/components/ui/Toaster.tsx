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
/** How long an Undo toast waits before it goes away for good. */
export const UNDO_MS = 5000;

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
 * A toast that can be taken back: shows an Undo button for 5 seconds. Pass what to do on Undo; it is not called if the toast is
 * ignored. Use it for quick actions that are cheap to reverse (a removed item, a dismissed notice) instead of a confirm step.
 */
function undo(title: string, onUndo: () => void | Promise<void>, extras: Omit<ToastExtras, "action"> = {}) {
  return sileo.info({
    ...withBody("info", title, extras.description),
    duration: extras.duration ?? UNDO_MS,
    button: {
      title: "Undo",
      onClick: () => {
        void onUndo();
      },
    },
  });
}

/** Emails go out 10 seconds after the click (the Undo button is still on screen for the first 5); everything else runs after 5. */
export const MAIL_HOLD_MS = 10000;

type HeldOptions = { mail?: boolean; description?: SileoOptions["description"] };
type HeldResult<T> = { undone: true } | { undone: false; value: T };

/**
 * For an action that cannot be reversed once it runs (a delete, a refund, an email). The real action is held back: Undo cancels it
 * (nothing ever happened), and doing nothing, or leaving the page, lets it run. Pass the action as `run`. Resolves `{ undone: true }`
 * if the person took it back, otherwise `{ undone: false, value }` with what the action returned (or throws what it threw), so a
 * caller can keep its own follow-up code. An action that sends an email (`mail: true`) is held 10 seconds instead of 5.
 */
function held<T>(title: string, run: () => T | Promise<T>, options: HeldOptions = {}): Promise<HeldResult<T>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", go);
    };
    const go = () => {
      if (settled) return;
      settled = true;
      finish();
      Promise.resolve()
        .then(run)
        .then((value) => resolve({ undone: false, value }), reject);
    };
    const timer = setTimeout(go, options.mail ? MAIL_HOLD_MS : UNDO_MS);
    // Closing the tab inside the window must not lose what the person asked for.
    window.addEventListener("pagehide", go);
    sileo.info({
      ...withBody("info", title, options.description),
      duration: UNDO_MS,
      button: {
        title: "Undo",
        onClick: () => {
          if (settled) return;
          settled = true;
          finish();
          resolve({ undone: true });
        },
      },
    });
  });
}

/** Holds the whole step that follows: resolves true to carry on, or false if the person tapped Undo. For code that is awkward to wrap. */
async function hold(title: string, options: HeldOptions = {}): Promise<boolean> {
  const r = await held(title, () => true, options);
  return !r.undone;
}

/** `held` for something the screen already hid: runs `commit` after the hold, or `onUndo` if it was taken back. */
function deferred(title: string, commit: () => void | Promise<void>, onUndo: () => void, options: HeldOptions = {}) {
  void held(title, commit, options)
    .then((r) => {
      if (r.undone) onUndo();
    })
    .catch(() => {});
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
  held,
  hold,
  deferred,
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
