"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { TOUR_STEPS } from "./tourSteps";
import { markOnboardingTourSeenAction } from "@/app/(dashboard)/about/actions";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PAD = 8;
const TOOLTIP_WIDTH = 320;
const GAP = 16;
const MARGIN = 16;

function getRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Wavy, spring-like connector between two points — a dotted/coiled line
 * rather than a plain straight one, per the tour's visual spec. Alternates
 * a perpendicular offset along the straight-line path in short segments.
 */
function buildCoiledPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const segments = Math.max(4, Math.min(14, Math.round(dist / 20)));
  const amplitude = Math.min(9, dist / 8);
  const px = -dy / dist;
  const py = dx / dist;

  let d = `M ${x1} ${y1}`;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const baseX = x1 + dx * t;
    const baseY = y1 + dy * t;
    const endOffset = i === segments ? 0 : amplitude * (i % 2 === 0 ? 1 : -1);
    const ctrlT = (i - 0.5) / segments;
    const ctrlOffset = amplitude * (i % 2 === 0 ? -1 : 1);
    const ctrlX = x1 + dx * ctrlT + px * ctrlOffset;
    const ctrlY = y1 + dy * ctrlT + py * ctrlOffset;
    d += ` Q ${ctrlX} ${ctrlY}, ${baseX + px * endOffset} ${baseY + py * endOffset}`;
  }
  return d;
}

/**
 * AppDock is one unified nav at every breakpoint now, so in practice each
 * data-tour value only has one live match today. Kept as querySelectorAll +
 * "first element with a real (nonzero) rect", not plain querySelector,
 * because the dead Sidebar/MobileTabBar/MoreSheet still carry a few of the
 * same data-tour values from before AppDock replaced them (harmless — those
 * components never mount, so they never actually appear in the DOM to
 * match) — and because it's the right defensive shape regardless, in case
 * a future nav split reintroduces a real duplicate.
 */
function findVisibleTarget(target: string): Element | null {
  const candidates = Array.from(document.querySelectorAll(`[data-tour="${target}"]`));
  return candidates.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }) ?? null;
}

function findTargetRect(target: string | null): Rect | null {
  if (!target) return null;
  const el = findVisibleTarget(target);
  return el ? getRect(el) : null;
}

/** Walks from `from` in `dir`, skipping steps whose target isn't currently visible in the DOM. Returns -1 if none found. */
function resolveStepIndex(from: number, dir: 1 | -1): number {
  let i = from;
  while (i >= 0 && i < TOUR_STEPS.length) {
    const step = TOUR_STEPS[i];
    if (!step.target || findVisibleTarget(step.target)) return i;
    i += dir;
  }
  return -1;
}

export function OnboardingTour({ autoShow }: { autoShow: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setMounted(true);
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // AppDock auto-hides on desktop now (see its own file). This step's
  // target can live inside it, so the tour needs a way to force it visible
  // rather than spotlighting a nav item that's currently translated
  // off-screen. A DOM CustomEvent, not a shared context: the two components
  // are unrelated siblings under a server DashboardLayout, and this is a
  // one-off signal, not state either side needs to read back.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent<boolean>("bnp:force-dock-visible", { detail: open }));
  }, [open]);

  // Auto-trigger: once per account, after a short delay so nav elements
  // have settled in — guarded by a ref (not just the autoShow prop, which
  // is a server-computed value from the page load and won't flip false
  // again this session) so it can't restart itself on an unrelated
  // client-side navigation. Manual replay: Settings -> Tutorials links to
  // /dashboard?tour=1; this depends on searchParams (not just [mounted])
  // so it still reacts even when OnboardingTour was already mounted from
  // an earlier dashboard page. Stripped from the URL the moment the tour
  // opens so refreshing or sharing the link doesn't re-trigger it.
  const autoShowFiredRef = useRef(false);
  useEffect(() => {
    if (!mounted) return;
    const wantsReplay = searchParams.get("tour") === "1";
    if (wantsReplay) {
      router.replace("/dashboard", { scroll: false });
      const start = resolveStepIndex(0, 1);
      if (start !== -1) {
        setStepIndex(start);
        setOpen(true);
      }
      return;
    }
    if (autoShow && !autoShowFiredRef.current) {
      autoShowFiredRef.current = true;
      const timer = setTimeout(() => {
        const start = resolveStepIndex(0, 1);
        if (start !== -1) {
          setStepIndex(start);
          setOpen(true);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [mounted, searchParams, autoShow, router]);

  const step = TOUR_STEPS[stepIndex];

  const measure = useCallback(() => {
    if (!step) return;
    if (!step.target) {
      setTargetRect(null);
      return;
    }
    const el = findVisibleTarget(step.target);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
      // Give scrollIntoView a moment to settle before measuring.
      requestAnimationFrame(() => requestAnimationFrame(() => setTargetRect(findTargetRect(step.target))));
    } else {
      setTargetRect(null);
    }
  }, [step, reducedMotion]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    measure();
    window.addEventListener("resize", measure);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stepIndex]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleSkip();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function finish() {
    setOpen(false);
    await markOnboardingTourSeenAction();
  }

  async function handleSkip() {
    await finish();
  }

  function goNext() {
    const next = resolveStepIndex(stepIndex + 1, 1);
    if (next === -1) {
      finish();
      return;
    }
    setStepIndex(next);
  }

  function goBack() {
    const prev = resolveStepIndex(stepIndex - 1, -1);
    if (prev === -1) return;
    setStepIndex(prev);
  }

  const layout = useMemo(() => {
    if (!targetRect) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rectCenterX = targetRect.left + targetRect.width / 2;

    const spaceBelow = vh - (targetRect.top + targetRect.height);
    const placeBelow = spaceBelow > 200 || spaceBelow > targetRect.top;

    const tooltipLeft = Math.min(Math.max(rectCenterX - TOOLTIP_WIDTH / 2, MARGIN), vw - TOOLTIP_WIDTH - MARGIN);
    const tooltipAnchorY = placeBelow ? targetRect.top + targetRect.height + SPOTLIGHT_PAD + GAP : targetRect.top - SPOTLIGHT_PAD - GAP;

    const lineFromX = tooltipLeft + Math.min(TOOLTIP_WIDTH, vw - 2 * MARGIN) / 2;
    const lineToY = placeBelow ? targetRect.top + targetRect.height + SPOTLIGHT_PAD : targetRect.top - SPOTLIGHT_PAD;
    const lineToX = Math.min(Math.max(rectCenterX, targetRect.left), targetRect.left + targetRect.width);

    return {
      placeBelow,
      tooltipLeft,
      tooltipAnchorY,
      path: buildCoiledPath(lineFromX, tooltipAnchorY, lineToX, lineToY),
    };
  }, [targetRect]);

  if (!mounted || !open || !step) return null;

  const isFirst = stepIndex === resolveStepIndex(0, 1);
  const isLast = resolveStepIndex(stepIndex + 1, 1) === -1;
  const visibleIndex = TOUR_STEPS.slice(0, stepIndex + 1).filter((s) => !s.target || findVisibleTarget(s.target)).length;
  const visibleTotal = TOUR_STEPS.filter((s) => !s.target || findVisibleTarget(s.target)).length;

  const transitionClass = reducedMotion ? "" : "transition-all duration-300 ease-out";

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="App tour">
      {/* Dimmed backdrop with a spotlight cutout around the current target, via a huge box-shadow — no SVG masking needed. */}
      {targetRect ? (
        <div
          className={`pointer-events-none fixed rounded-2xl ${transitionClass}`}
          style={{
            top: targetRect.top - SPOTLIGHT_PAD,
            left: targetRect.left - SPOTLIGHT_PAD,
            width: targetRect.width + SPOTLIGHT_PAD * 2,
            height: targetRect.height + SPOTLIGHT_PAD * 2,
            // Ink scrim, not navy: the spotlight still has to darken a light
            // page to isolate its target, so this is one of the few places
            // that stays genuinely dark in the paper system.
            boxShadow: "0 0 0 9999px rgba(26,21,15,0.62)",
            border: "2px solid rgba(160,78,30,0.85)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-scrim/60" onClick={handleSkip} />
      )}

      {/* Coiled connector — only drawn when there's a real target to point at. */}
      {targetRect && layout && (
        <svg className="pointer-events-none fixed inset-0 h-full w-full" aria-hidden>
          <path d={layout.path} fill="none" stroke="rgba(232,180,140,0.9)" strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round" />
        </svg>
      )}

      {/* Tooltip / step card */}
      <div
        className={`glass-surface-modal fixed p-5 ${transitionClass}`}
        style={
          targetRect && layout
            ? {
                width: `min(${TOOLTIP_WIDTH}px, calc(100vw - ${MARGIN * 2}px))`,
                left: layout.tooltipLeft,
                ...(layout.placeBelow ? { top: layout.tooltipAnchorY } : { bottom: window.innerHeight - layout.tooltipAnchorY }),
              }
            : {
                width: `min(${TOOLTIP_WIDTH}px, calc(100vw - ${MARGIN * 2}px))`,
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
              }
        }
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">
            {visibleIndex} of {visibleTotal}
          </p>
          <button type="button" onClick={handleSkip} aria-label="Skip tour" className="shrink-0 text-slate-500 transition hover:text-slate-200">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <h2 className="mt-1.5 text-body text-slate-50 font-semibold">{step.title}</h2>
        <p className="mt-2 text-small text-slate-400">{step.body}</p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" onClick={handleSkip} className="text-small text-slate-500 transition hover:text-slate-300">
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={goBack}
                className="rounded-lg px-3 py-1.5 text-small font-medium text-slate-300 transition bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={goNext}
              className="cta-sheen cta-fill rounded-lg px-4 py-1.5 text-small font-semibold"
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
