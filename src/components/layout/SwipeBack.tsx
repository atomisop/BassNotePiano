"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { canGoBackInApp } from "@/lib/navHistory";

const EDGE_PX = 22;
const COMMIT_PX = 110;
const COMMIT_VELOCITY = 0.55; // px per ms

function isInstalledApp(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Drag in from the left edge to go back, like the system gesture: the page follows the finger and slides away, with a back chip
 * under it, and letting go far enough (or with a flick) goes to the previous page; otherwise it springs back. Only in the installed
 * app, where the browser has no edge-swipe of its own, and only when the previous page is one of ours.
 */
export function SwipeBack() {
  const router = useRouter();
  const chip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isInstalledApp() || !window.matchMedia("(pointer: coarse)").matches) return;
    const main = () => document.querySelector<HTMLElement>("[data-surface='app'] main");
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let engaged = false;
    let tracking = false;

    const paint = (dx: number) => {
      const el = main();
      if (el) {
        el.style.transition = "none";
        el.style.transform = `translateX(${dx}px)`;
        el.style.opacity = String(1 - Math.min(dx / 600, 0.25));
      }
      const c = chip.current;
      if (c) {
        c.style.transition = "none";
        c.style.opacity = String(Math.min(dx / COMMIT_PX, 1));
        c.style.transform = `translate(${Math.min(dx * 0.35, 28) - 28}px, -50%) scale(${0.7 + Math.min(dx / COMMIT_PX, 1) * 0.3})`;
      }
    };
    const reset = (animate: boolean) => {
      const el = main();
      if (el) {
        el.style.transition = animate ? "transform 220ms cubic-bezier(0.32,0.72,0,1), opacity 220ms" : "none";
        el.style.transform = "";
        el.style.opacity = "";
      }
      const c = chip.current;
      if (c) {
        c.style.transition = "opacity 180ms, transform 180ms";
        c.style.opacity = "0";
        c.style.transform = "translate(-28px, -50%) scale(0.7)";
      }
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      tracking = e.touches.length === 1 && t.clientX <= EDGE_PX && canGoBackInApp();
      engaged = false;
      startX = t.clientX;
      startY = t.clientY;
      startT = performance.now();
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!engaged) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > dx) return void (tracking = false);
        if (dx < 8) return;
        engaged = true;
      }
      e.preventDefault();
      paint(Math.max(0, dx));
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking || !engaged) return void (tracking = false);
      tracking = false;
      const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
      const velocity = dx / Math.max(performance.now() - startT, 1);
      if (dx > COMMIT_PX || velocity > COMMIT_VELOCITY) {
        const el = main();
        if (el) {
          el.style.transition = "transform 160ms ease-in, opacity 160ms";
          el.style.transform = `translateX(${window.innerWidth}px)`;
          el.style.opacity = "0";
        }
        window.setTimeout(() => {
          router.back();
          // The previous page replaces this one underneath; put the scroller back for it.
          window.setTimeout(() => reset(false), 60);
        }, 150);
      } else {
        reset(true);
      }
    };
    const onCancel = () => {
      if (engaged) reset(true);
      tracking = false;
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, [router]);

  return (
    <div
      ref={chip}
      aria-hidden
      style={{ opacity: 0, transform: "translate(-28px, -50%) scale(0.7)" }}
      className="pointer-events-none fixed left-0 top-1/2 z-(--z-chrome) flex h-10 w-10 items-center justify-center rounded-full bg-neu-lift text-slate-100 shadow-raised-low"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </div>
  );
}
