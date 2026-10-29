"use client";

import { useEffect } from "react";

const CLICKABLE = 'button, a[href], [role="button"], [role="switch"], [role="tab"], summary';

/** A control that is a pane of Liquid Glass: it blurs what is behind it, is the main orange glass action, or is a tab in the glass dock. */
function isGlass(el: HTMLElement): boolean {
  if (el.matches(".liquid-signal") || el.closest(".liquid-dock")) return true;
  const style = getComputedStyle(el);
  const blur = style.backdropFilter || (style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter || "";
  return blur !== "" && blur !== "none";
}

/**
 * Gives every Liquid Glass control the iPhone feel. While it is held it swells and lights up (data-lg-press); when it is let go it
 * stretches and wobbles back to rest (data-lg-release). The motion itself is in globals.css; this only sets the two states, from one
 * listener for the whole app (nothing per button). Skipped for anyone who asks for reduced motion.
 */
export function LiquidPress() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let held: HTMLElement | null = null;

    const release = () => {
      const el = held;
      held = null;
      if (!el) return;
      el.removeAttribute("data-lg-press");
      el.setAttribute("data-lg-release", "");
      const done = () => el.removeAttribute("data-lg-release");
      el.addEventListener("animationend", done, { once: true });
      window.setTimeout(done, 800);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const target = e.target instanceof Element ? e.target.closest<HTMLElement>(CLICKABLE) : null;
      if (!target || (target as HTMLButtonElement).disabled || target.getAttribute("aria-disabled") === "true" || !isGlass(target)) return;
      if (held) release();
      target.removeAttribute("data-lg-release");
      target.setAttribute("data-lg-press", "");
      held = target;
    };

    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerup", release, { passive: true });
    document.addEventListener("pointercancel", release, { passive: true });
    window.addEventListener("blur", release);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, []);

  return null;
}
