"use client";

import { useEffect } from "react";

const EDITABLE = "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=file]), textarea, select, [contenteditable=''], [contenteditable='true']";

function editableFocused(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLElement && el.matches(EDITABLE);
}

/**
 * Phones and tablets: when the on-screen keyboard opens, the browser keeps the layout the same size and just slides the
 * keyboard over the bottom of it, which hides whatever the person is typing into (a message box, a form field in a sheet).
 * This watches the visual viewport (the part of the screen the keyboard leaves visible) and publishes its size as
 * --vv-top, --vv-height and --kb-height on <html>, with data-keyboard="open" while a field is focused. globals.css uses
 * those to squeeze the full-screen app shell, bottom sheets and panels into the visible area, so the content shrinks and
 * the typing box stays in view. It also scrolls the focused field into view. Does nothing on a computer (fine pointer).
 */
export function KeyboardAvoider() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !window.matchMedia("(pointer: coarse)").matches) return;
    const root = document.documentElement;
    let raf = 0;

    const apply = () => {
      raf = 0;
      const keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const open = keyboard > 100 && editableFocused();
      if (open) {
        root.style.setProperty("--vv-top", `${Math.round(vv.offsetTop)}px`);
        root.style.setProperty("--vv-height", `${Math.round(vv.height)}px`);
        root.style.setProperty("--kb-height", `${Math.round(keyboard + vv.offsetTop)}px`);
        root.dataset.keyboard = "open";
      } else if (root.dataset.keyboard) {
        delete root.dataset.keyboard;
        root.style.removeProperty("--vv-top");
        root.style.removeProperty("--vv-height");
        root.style.removeProperty("--kb-height");
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const onFocusIn = (e: FocusEvent) => {
      schedule();
      const el = e.target;
      if (!(el instanceof HTMLElement) || !el.matches(EDITABLE)) return;
      // The keyboard takes a moment to finish opening; once it has, make sure this field is on screen.
      window.setTimeout(() => {
        if (document.activeElement === el) el.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 320);
    };

    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", () => window.setTimeout(schedule, 60));
    return () => {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", onFocusIn);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
