"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "@/components/ui/appIcons";
import { hintWidth, placeHint, type HintPlacement } from "@/lib/hintPlacement";
import { cn } from "@/lib/utils";

// useLayoutEffect warns during server rendering; the popup only ever opens in the browser.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A tiny "i" that opens a small popup with one short line, when someone taps it (or hovers it on a computer). For the few things that really need a word of
 * explanation (a privacy warning, a one-time step), so the screen itself stays free of explainer text. Closes on a tap elsewhere, a scroll, a resize or Escape.
 *
 * The popup is drawn on the screen itself (a portal with fixed position), not inside the page, and placed by `placeHint`: it opens on the
 * `side` and `align` asked for, then slides or flips so ALL of it stays on the screen, whatever sits around the "i" (a centered line, a card
 * with a clipped edge, the right side of a phone). No caller has to know where its "i" lands.
 */
export function Hint({
  children,
  label = "More info",
  className,
  side = "bottom",
  align = "left",
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
  /** Prefer opening above the "i" instead of below it (it flips by itself when there is no room). */
  side?: "bottom" | "top";
  /** Which edge of the popup lines up with the "i" (it slides to stay on the screen). */
  align?: "left" | "right" | "center";
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<HintPlacement | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  const close = useCallback(() => {
    setOpen(false);
    setPlace(null);
  }, []);

  // Measure the "i" and the popup, then put the popup where all of it fits. This runs before the browser paints, so it never shows in the wrong place.
  useIsoLayoutEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    const pop = popRef.current;
    if (!button || !pop) return;
    const a = button.getBoundingClientRect();
    const size = pop.getBoundingClientRect();
    const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
    setPlace(placeHint({ left: a.left, top: a.top, right: a.right, bottom: a.bottom }, { width: size.width, height: size.height }, viewport, side, align));
  }, [open, side, align]);

  useEffect(() => {
    if (!open) return;
    const inside = (node: Node) => Boolean(ref.current?.contains(node) || popRef.current?.contains(node));
    const onDown = (e: PointerEvent) => {
      if (!inside(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    // The popup is fixed to the screen, so a scroll (or a turn of the phone) would leave it away from its "i": it simply closes.
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Node) || !popRef.current?.contains(e.target)) close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  return (
    <span
      ref={ref}
      className={cn("relative inline-flex align-middle", className)}
      onMouseEnter={(e) => e.nativeEvent instanceof MouseEvent && window.matchMedia("(hover: hover)").matches && setOpen(true)}
      onMouseLeave={() => window.matchMedia("(hover: hover)").matches && close()}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (window.matchMedia("(hover: hover)").matches || !open ? setOpen(true) : close())}
        className="tap flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info aria-hidden className="h-4 w-4" strokeWidth={1.75} />
      </button>
      {open &&
        createPortal(
          <span
            ref={popRef}
            id={id}
            role="note"
            // 16rem wide (less on a very narrow screen). Until it has been measured it sits invisibly at the corner; afterwards it is placed against the screen, never the page.
            // pointer-events auto: a modal dialog turns pointer events off for everything outside it, which would let a press on this text fall
            // through to the dialog's backdrop and close the dialog. The popup is still inside the dialog's React tree, so the dialog counts a press on it as inside.
            style={{
              pointerEvents: "auto",
              width: hintWidth(document.documentElement.clientWidth),
              ...(place ? { left: place.left, top: place.top, ...(place.maxHeight ? { maxHeight: place.maxHeight } : {}) } : { left: 0, top: 0, visibility: "hidden" }),
            }}
            className="fixed z-[80] block overflow-y-auto overscroll-contain rounded-xl bg-neu-lift p-3 text-small font-normal normal-case leading-snug tracking-normal text-slate-200 shadow-raised-high ring-1 ring-slate-50/10"
          >
            {children}
          </span>,
          document.body,
        )}
    </span>
  );
}
