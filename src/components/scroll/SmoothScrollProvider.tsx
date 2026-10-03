"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Page physics.
 *
 * Lenis intercepts wheel/touch input and drives the *real* window scroll
 * position toward a target with a damped easing curve, rather than
 * transforming a wrapper element. That distinction is the whole reason this
 * is safe to drop into an existing app:
 *
 *  - `position: sticky` still works (a transformed ancestor would break it,
 *    which is exactly the trap the scene-lock below would fall into),
 *  - Framer Motion's `useScroll` still works, because genuine `scroll`
 *    events still fire,
 *  - anchor links, the browser's own scroll restoration, and
 *    `scrollIntoView` all still resolve to correct positions.
 *
 * The easing is an exponential decay rather than a fixed-duration tween:
 * fixed durations feel rubbery on a trackpad because a flick and a nudge take
 * the same time to settle. Decay makes distance set the duration, which is
 * what "fluid" actually means physically.
 */
/**
 * The running instance, module-scoped.
 *
 * Anything that scrolls the page programmatically has to go through Lenis
 * rather than `window.scrollTo`. Lenis holds its own target position and eases
 * toward it every frame, so an external jump gets treated as a conflicting
 * input — measured in the browser, a plain `window.scrollTo` mid-run
 * overshot its target by more than a full scene. Native smooth behaviour is
 * dead here too, since Lenis sets `scroll-behavior: auto !important`.
 */
let activeLenis: Lenis | null = null;

/**
 * Scroll the page, correctly, whether or not smooth scrolling is running.
 * Falls back to the native call when Lenis is absent — reduced-motion
 * visitors, and every route outside the marketing surface.
 */
export function smoothScrollTo(target: number | string | HTMLElement, immediate = false) {
  if (activeLenis) {
    activeLenis.scrollTo(target, { immediate });
    return;
  }
  const top = typeof target === "number" ? target : 0;
  window.scrollTo({ top, behavior: immediate ? "auto" : "smooth" });
}

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Honour the OS setting rather than smoothing anyway at a lower amount.
    // Someone who turns this on is often doing it for vestibular reasons, and
    // "less inertia" is still inertia — native scroll is the correct answer.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    const lenis = new Lenis({
      // Decay constant. Lower = longer glide. 0.14 settles to 90% of a wheel
      // notch in roughly 0.27s (0.085 took 0.43s and read as input delay).
      lerp: 0.14,
      // Slightly under 1 so a single wheel notch travels a touch less than
      // native — this is what reads as "weight" rather than as lag.
      wheelMultiplier: 0.92,
      // Touch is left at native speed. Damping a finger drag makes the page
      // feel like it's sticking to the glass, which is the one place smooth
      // scrolling reliably feels broken.
      touchMultiplier: 1,
      syncTouch: false,
    });

    activeLenis = lenis;

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      if (activeLenis === lenis) activeLenis = null;
    };
  }, []);

  return <>{children}</>;
}
