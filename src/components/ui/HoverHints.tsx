"use client";

import { useEffect, useRef, useState } from "react";

// One hover hint for every icon-only control in the app. A button or link that has an aria-label but no visible words
// (the top bar's round buttons, the dock, close and menu icons) shows its label in a small bubble after a short pause,
// on a mouse hover or keyboard focus. Nothing is wired per button: a new icon button with an aria-label gets it for free.
// Opt out with data-no-hint. Touch screens never show one (no hover there), and Escape, a press or a scroll hides it.
const DELAY_MS = 450;
const SELECTOR = "button, a, [role='button'], [role='tab'], [role='switch']";

type Hint = { text: string; x: number; top: number; bottom: number };

function hintFor(el: Element | null): { el: HTMLElement; text: string } | null {
  const target = el?.closest<HTMLElement>(SELECTOR);
  if (!target || target.hasAttribute("data-no-hint")) return null;
  const text = target.getAttribute("aria-label")?.trim();
  if (!text || text.length > 60) return null;
  // Controls that already show their words do not need the same words again.
  if ((target.textContent ?? "").trim().length > 0) return null;
  if (target.matches(":disabled, [aria-disabled='true']")) return null;
  return { el: target, text };
}

export function HoverHints() {
  const [hint, setHint] = useState<Hint | null>(null);
  const timer = useRef<number | null>(null);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function clear() {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      current.current = null;
      setHint(null);
    }
    function schedule(el: HTMLElement, text: string) {
      if (current.current === el) return;
      clear();
      current.current = el;
      timer.current = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        setHint({ text, x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
      }, DELAY_MS);
    }
    function onOver(e: PointerEvent) {
      if (e.pointerType !== "mouse") return;
      const found = hintFor(e.target as Element);
      if (found) schedule(found.el, found.text);
      else clear();
    }
    function onFocus(e: FocusEvent) {
      const t = e.target as HTMLElement;
      if (!t.matches?.(":focus-visible")) return;
      const found = hintFor(t);
      if (found) schedule(found.el, found.text);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") clear();
    }
    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerdown", clear, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("focusout", clear, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", clear, true);
    return () => {
      clear();
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerdown", clear, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("focusout", clear, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", clear, true);
    };
  }, []);

  if (!hint) return null;
  // Below the control, or above it when it sits low on the screen (the dock) or there is no room.
  const above = hint.bottom + 44 > window.innerHeight;
  const x = Math.min(Math.max(hint.x, 60), window.innerWidth - 60);
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[95] max-w-[240px] -translate-x-1/2 rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-caption font-medium text-white shadow-lg"
      style={{ left: x, top: above ? undefined : hint.bottom + 8, bottom: above ? window.innerHeight - hint.top + 8 : undefined }}
    >
      {hint.text}
    </div>
  );
}
