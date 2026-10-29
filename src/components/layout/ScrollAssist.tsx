"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowUp, List } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import {
  SCROLL_POSITIONS_STORAGE_KEY,
  ignoresMainScroll,
  readPositions,
  scrollKey,
  shouldOfferJump,
  shouldShowBackToTop,
  uniqueTitles,
  withPosition,
} from "@/lib/scrollAssist";

/** The dock (or anything else) asks for the top by dispatching this on window. */
export const SCROLL_TOP_EVENT = "bnp:scroll-top";

const RESTORE_WINDOW_MS = 1200;

function scroller(): HTMLElement | null {
  return document.getElementById("app-scroll");
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Three small helpers for the signed-in app's one scroll area (`<main id="app-scroll">`):
 *
 * 1. Back keeps your place. Going back (or forward) returns to where you were on that page, not the top.
 *    Opening a page fresh (a link tap) still starts at the top.
 * 2. A back-to-top button appears after about a screen and a half of scrolling.
 * 3. Tapping the current tab in the dock jumps to the top (the iPhone habit).
 */
export function ScrollAssist() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const key = scrollKey(pathname, search);
  // Updated while rendering, not in an effect: the new page's first scroll event (Next puts it back at the top) can fire
  // before any effect runs, and it must be filed under the new page, not overwrite the spot the old one was left at.
  const keyRef = useRef(key);
  keyRef.current = key;
  const pushedRef = useRef(false);
  const [show, setShow] = useState(false);
  // The page's own section titles, for the "Jump to" sheet (read when it is needed, never kept in step with the page).
  const [canJump, setCanJump] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpItems, setJumpItems] = useState<{ title: string; index: number }[]>([]);
  const headingsRef = useRef<HTMLElement[]>([]);

  // A link tap or router.push opens a page with history.pushState; going back or forward does not. That tells a return
  // from a first visit (listening for popstate is not reliable: Next renders the page before a listener of ours runs).
  useEffect(() => {
    const original = window.history.pushState;
    const wrapped: typeof window.history.pushState = function (this: History, ...args) {
      pushedRef.current = true;
      return original.apply(this, args);
    };
    window.history.pushState = wrapped;
    return () => {
      if (window.history.pushState === wrapped) window.history.pushState = original;
    };
  }, []);

  // The page never slides sideways: it is clipped (overflow-x hidden) but still scrollable by script or by something inside it
  // asking to be scrolled into view. Wherever that comes from, put it back.
  useEffect(() => {
    const el = scroller();
    if (!el) return;
    const keepLeft = () => {
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
    };
    el.addEventListener("scroll", keepLeft, { passive: true });
    return () => el.removeEventListener("scroll", keepLeft);
  }, []);

  // Remember where this page was scrolled to, and show the back-to-top button.
  useEffect(() => {
    const el = scroller();
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setShow(shouldShowBackToTop(el.scrollTop, el.clientHeight));
        if (ignoresMainScroll(window.location.pathname)) return;
        try {
          const positions = readPositions(sessionStorage.getItem(SCROLL_POSITIONS_STORAGE_KEY));
          sessionStorage.setItem(SCROLL_POSITIONS_STORAGE_KEY, JSON.stringify(withPosition(positions, keyRef.current, el.scrollTop)));
        } catch {
          // Storage blocked: the page just opens at the top, as it always did.
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // A different page: after a back or forward, return to the remembered spot; otherwise it starts at the top.
  useEffect(() => {
    const el = scroller();
    if (!el) return;
    setShow(false);
    const openedFresh = pushedRef.current;
    pushedRef.current = false;
    if (openedFresh || ignoresMainScroll(pathname)) return;
    let target = 0;
    try {
      target = readPositions(sessionStorage.getItem(SCROLL_POSITIONS_STORAGE_KEY))[key] ?? 0;
    } catch {
      return;
    }
    if (target <= 0) return;

    // The page streams in after the route changes, and Next scrolls the new page to its own top as it appears:
    // keep putting the saved spot back until the page is tall enough and has settled (or the window runs out).
    const startedAt = performance.now();
    let frame = 0;
    const settle = () => {
      const reachable = el.scrollHeight - el.clientHeight >= target - 1;
      if (reachable && Math.abs(el.scrollTop - target) <= 1 && performance.now() - startedAt > 250) return;
      if (reachable) el.scrollTop = target;
      if (performance.now() - startedAt < RESTORE_WINDOW_MS) frame = requestAnimationFrame(settle);
    };
    frame = requestAnimationFrame(settle);
    // A finger on the page means they are scrolling themselves: stop fighting them.
    const stop = () => cancelAnimationFrame(frame);
    el.addEventListener("touchstart", stop, { once: true, passive: true });
    el.addEventListener("wheel", stop, { once: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("wheel", stop);
    };
  }, [key, pathname]);

  // Anything can ask for the top (the dock's current tab does).
  useEffect(() => {
    const toTop = () => scroller()?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    window.addEventListener(SCROLL_TOP_EVENT, toTop);
    return () => window.removeEventListener(SCROLL_TOP_EVENT, toTop);
  }, []);

  // Whether this page has enough sections for a jump list: checked when the page first scrolls far enough to want one.
  useEffect(() => {
    if (show) setCanJump(shouldOfferJump(visibleHeadings().length));
  }, [show, key]);

  function openJump() {
    const headings = visibleHeadings();
    headingsRef.current = headings;
    // A folded section's heading also holds its summary ("2 stopped"); it names itself in data-jump-title.
    setJumpItems(uniqueTitles(headings.map((h) => h.dataset.jumpTitle ?? h.textContent ?? "")));
    setJumpOpen(true);
  }

  function jumpTo(index: number) {
    const heading = headingsRef.current[index];
    setJumpOpen(false);
    if (!heading) return;
    // A section that is folded on a phone opens as you arrive, so the jump lands on something you can read.
    heading.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click();
    // After the sheet has closed and released the page's scroll lock.
    window.setTimeout(() => heading.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }), 180);
  }

  const buttonClass =
    "tap flex h-11 w-11 items-center justify-center rounded-full bg-neu-base text-slate-100 shadow-raised-mid transition active:shadow-pressed-low";
  return (
    <>
      {show && (
        // Bottom left, clear of the dock (which is centred) and of Ask AI (bottom right).
        <div className="kb-hide fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5.75rem)] left-4 z-(--z-chrome) flex flex-col gap-2.5 lg:bottom-6">
          {canJump && (
            <button type="button" aria-label="Jump to a section" onClick={openJump} className={buttonClass}>
              <List aria-hidden className="h-5 w-5" />
            </button>
          )}
          <button type="button" aria-label="Back to top" onClick={() => window.dispatchEvent(new Event(SCROLL_TOP_EVENT))} className={buttonClass}>
            <ArrowUp aria-hidden className="h-5 w-5" />
          </button>
        </div>
      )}
      <Dialog open={jumpOpen} onOpenChange={setJumpOpen} title="Jump to">
        <ul className="-mx-2 divide-y divide-slate-50/10">
          {jumpItems.map((item) => (
            <li key={item.index}>
              <button type="button" onClick={() => jumpTo(item.index)} className="tap flex w-full items-center justify-between gap-3 rounded-xl px-2 py-3 text-left text-body text-slate-100 active:bg-neu-lift">
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}

/** The page's visible level-2 titles: hidden ones (a desktop-only or phone-only copy) and screen-reader-only ones are skipped. */
function visibleHeadings(): HTMLElement[] {
  const root = scroller();
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>("h2")).filter(
    (h) => h.getClientRects().length > 0 && !h.classList.contains("sr-only") && (h.textContent ?? "").trim().length > 0,
  );
}
