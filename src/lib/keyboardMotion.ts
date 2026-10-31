/**
 * Keyboard actions never animate. A shortcut is pressed many times a day, and motion on it reads as lag, so the key handler marks
 * `<html data-kb-motion="off">` the moment a shortcut fires, and globals.css drops the command menu's, the page arrival's and the
 * sidebar's animations while it is set. The mark clears on the next pointer press, or after a few seconds (a page that took that long
 * to arrive can fade in like any other).
 */

const CLEAR_AFTER_MS = 2500;
let timer: number | undefined;

function clear() {
  window.clearTimeout(timer);
  delete document.documentElement.dataset.kbMotion;
  window.removeEventListener("pointerdown", clear, true);
}

export function markKeyboardAction() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.kbMotion = "off";
  window.clearTimeout(timer);
  timer = window.setTimeout(clear, CLEAR_AFTER_MS);
  window.addEventListener("pointerdown", clear, true);
}
