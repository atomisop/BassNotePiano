"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { announceChange } from "@/lib/liveEvents";

// Pull distance (px, after the rubber-band curve below) that counts as "refresh", where the page rests while it refreshes, and the
// farthest it can ever travel.
const THRESHOLD_PX = 64;
const HOLD_PX = 56;
const MAX_PX = 120;
const SPOKES = 12;
// The spinner shows for at least this long, so a fast refresh does not look like a flash.
const MIN_SPIN_MS = 700;
// Never leave the spinner up forever if the server is slow.
const MAX_SPIN_MS = 8000;

type Phase = "idle" | "pulling" | "armed" | "refreshing";

/** Rubber band: easy at first, firmer the farther you go, and it never passes MAX_PX. */
function rubberBand(dy: number): number {
  return (1 - 1 / ((dy * 1.2) / MAX_PX + 1)) * MAX_PX;
}

/**
 * The signed-in app's scroll area, with pull-to-refresh.
 *
 * The shell is locked on purpose (fixed screen, `overscroll-behavior: none` on the body, `overscroll-contain` here) so the top bar and
 * dock can never be dragged, which also switches off the browser's own pull-to-refresh. This gives it back inside the one scroll area:
 * pull down at the very top and release past the line.
 *
 * What makes it feel smooth: the finger drives the page and the spinner directly (no React state per touch move, so the page behind it
 * is never re-rendered while you pull), the pull follows a rubber band curve, the browser's own bounce is switched off while you pull
 * (so the two never fight), twelve spokes light up one by one as you go (the ring turns solid at the line, with a small tap on phones
 * that can buzz), and it settles back with a spring-like ease. On release it refreshes the page's data in place (no white flash) and
 * tells the credit badge, banners and inbox to look again. Reduced motion gets a gentle pulse instead of a turning ring.
 *
 * Skipped on /messages (its panes have their own scrolling lists), when the touch began inside something already scrolled down, and
 * for sideways drags. Touch screens only: nothing here runs with a mouse.
 */
export function PullToRefreshMain({ className, children }: { className: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const mainRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [phase, setPhaseState] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const [isPending, startTransition] = useTransition();
  const refreshStartedAt = useRef(0);

  const enabled = !pathname.startsWith("/messages");

  function setPhase(next: Phase) {
    if (phaseRef.current === next) return;
    phaseRef.current = next;
    setPhaseState(next);
  }

  // Moves the page and the spinner to `pull` px without touching React state.
  function paint(pull: number, animate: boolean) {
    const content = contentRef.current;
    const indicator = indicatorRef.current;
    if (!content || !indicator) return;
    const ease = animate ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
    content.style.transition = ease;
    content.style.transform = pull > 0 || animate ? `translate3d(0, ${pull}px, 0)` : "";
    const progress = Math.min(1, pull / THRESHOLD_PX);
    indicator.style.transition = animate ? "opacity 200ms ease-out" : "none";
    indicator.style.opacity = String(Math.min(1, pull / 28));
    indicator.style.setProperty("--p", String(phaseRef.current === "refreshing" ? 1 : progress));
    indicator.style.setProperty("--s", String(0.6 + 0.4 * progress));
  }

  // Back to rest. The transform is cleared at the end so nothing is left inside a transformed box (which would break fixed children).
  function settle() {
    paint(0, true);
    const content = contentRef.current;
    if (!content) return;
    const clear = () => {
      content.style.transform = "";
      content.style.transition = "";
      content.removeEventListener("transitionend", clear);
    };
    content.addEventListener("transitionend", clear);
    window.setTimeout(clear, 400);
  }

  useEffect(() => {
    const main = mainRef.current;
    if (!main || !enabled) return;

    let start: { x: number; y: number } | null = null;
    let active = false;
    let latestPull = 0;

    function startedInsideScrolledArea(target: EventTarget | null): boolean {
      let el = target instanceof HTMLElement ? target : null;
      while (el && el !== main) {
        if (el.scrollHeight > el.clientHeight && el.scrollTop > 0) return true;
        el = el.parentElement;
      }
      return false;
    }

    function onStart(e: TouchEvent) {
      if (phaseRef.current === "refreshing" || !main || main.scrollTop > 0 || startedInsideScrolledArea(e.target)) {
        start = null;
        return;
      }
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      active = false;
      latestPull = 0;
    }

    function onMove(e: TouchEvent) {
      if (!start || !main) return;
      const dy = e.touches[0].clientY - start.y;
      const dx = e.touches[0].clientX - start.x;
      if (!active) {
        // Decide what this gesture is: a sideways swipe or an upward scroll is not a pull, and neither is a page that has moved.
        if (Math.abs(dx) > Math.abs(dy) + 4 || dy < -4 || main.scrollTop > 0) {
          start = null;
          return;
        }
        if (dy < 8) return;
        active = true;
        setPhase("pulling");
      }
      // From here on the finger belongs to the pull: stop the browser's own bounce from fighting it.
      if (e.cancelable) e.preventDefault();
      latestPull = rubberBand(Math.max(0, dy - 8));
      paint(latestPull, false);
      const armed = latestPull >= THRESHOLD_PX;
      if (armed && phaseRef.current !== "armed") {
        setPhase("armed");
        // A light tap where the browser allows it (Android); iOS Safari has no web vibration, the solid ring says the same thing.
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(8);
      } else if (!armed && phaseRef.current === "armed") {
        setPhase("pulling");
      }
    }

    function onEnd() {
      const wasActive = active;
      start = null;
      active = false;
      if (!wasActive) return;
      if (phaseRef.current === "armed") {
        setPhase("refreshing");
        refreshStartedAt.current = Date.now();
        paint(HOLD_PX, true);
        // The data behind the page, in place. The credit badge, banners and inbox are told to look again as well.
        startTransition(() => router.refresh());
        announceChange("status", "notifications", "messages");
      } else {
        setPhase("idle");
        settle();
      }
      latestPull = 0;
    }

    main.addEventListener("touchstart", onStart, { passive: true });
    main.addEventListener("touchmove", onMove, { passive: false });
    main.addEventListener("touchend", onEnd);
    main.addEventListener("touchcancel", onEnd);
    return () => {
      main.removeEventListener("touchstart", onStart);
      main.removeEventListener("touchmove", onMove);
      main.removeEventListener("touchend", onEnd);
      main.removeEventListener("touchcancel", onEnd);
    };
    // paint/settle only touch refs; router and startTransition are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Done refreshing (the new data arrived, and the spinner has shown long enough): settle back to rest.
  useEffect(() => {
    if (phase !== "refreshing" || isPending) return;
    const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - refreshStartedAt.current));
    const t = window.setTimeout(() => {
      setPhase("idle");
      settle();
    }, wait);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isPending]);

  useEffect(() => {
    if (phase !== "refreshing") return;
    const t = window.setTimeout(() => {
      setPhase("idle");
      settle();
    }, MAX_SPIN_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Leaving the page mid-refresh: nothing to put back.
  useEffect(() => {
    const content = contentRef.current;
    return () => {
      if (content) {
        content.style.transform = "";
        content.style.transition = "";
      }
    };
  }, []);

  return (
    <main id="app-scroll" ref={mainRef} className={className}>
      <div ref={contentRef} className="relative">
        <div
          ref={indicatorRef}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-3.25rem] z-40 -translate-x-1/2 opacity-0"
          style={{ ["--p" as string]: 0, ["--s" as string]: 0.6 }}
        >
          <div
            data-phase={phase}
            className={`ptr-well relative h-10 w-10 rounded-full bg-neu-base shadow-raised-mid transition-colors duration-150 ${
              phase === "armed" || phase === "refreshing" ? "text-slate-50" : "text-slate-400"
            }`}
            style={{ transform: "scale(var(--s, 1))" }}
          >
            {Array.from({ length: SPOKES }).map((_, i) => (
              <span key={i} className="ptr-spoke" style={{ ["--i" as string]: i }} />
            ))}
          </div>
        </div>
        {children}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {phase === "refreshing" ? "Refreshing" : phase === "armed" ? "Release to refresh" : ""}
      </span>
    </main>
  );
}
