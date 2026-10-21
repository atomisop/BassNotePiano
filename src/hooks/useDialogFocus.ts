"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behavior every modal dialog needs, for people who do not use a mouse: focus moves into the dialog when it opens, Tab
 * and Shift+Tab stay inside it, Escape closes it, and focus goes back to what was focused before when it closes.
 *
 * Attach the returned ref to the element that has role="dialog" (give it tabIndex={-1} so it can take focus when it holds nothing
 * focusable). `onEscape` should be the same function the Close button and the backdrop use (so a dialog that refuses to close
 * while it is busy still refuses); leave it out when the component already closes itself on Escape.
 *
 * Options: `trap: false` for a popover that is not modal (focus still moves in and comes back, but Tab may leave it), and `ref`
 * to use an element ref the component already owns (for example one it also uses to detect clicks outside).
 */
export function useDialogFocus<T extends HTMLElement>(open: boolean, onEscape?: () => void, options: { trap?: boolean; ref?: RefObject<T | null> } = {}) {
  const ownRef = useRef<T>(null);
  const ref = options.ref ?? ownRef;
  const trap = options.trap ?? true;
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;

    // One frame later, so an entrance animation or an autoFocus field inside has had its say first.
    const raf = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el || el.contains(document.activeElement)) return;
      (el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus({ preventScroll: true });
    });

    function onKeyDown(e: KeyboardEvent) {
      const el = ref.current;
      if (!el) return;
      if (e.key === "Escape" && escapeRef.current && !e.defaultPrevented) {
        e.stopPropagation();
        escapeRef.current();
        return;
      }
      if (e.key !== "Tab" || !trap) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === el || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [open, ref, trap]);

  return ref;
}
